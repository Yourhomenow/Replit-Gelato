import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, LoaderCircle, MapPin, Search } from 'lucide-react';
import {
  getGetScoopForecastQueryKey, getSearchForecastLocationsQueryKey,
  useSaveForecastSettings, useSearchForecastLocations,
} from '@workspace/api-client-react';
import type { ForecastLocation, ForecastSettings } from '@workspace/api-client-react';
import { countryOptions, timezoneLabel, timezoneOptions } from '@/lib/location-options';

export function ForecastLocationForm({ branchId, branchName, settings, onSaved, onCancel }: {
  branchId: string; branchName: string; settings: ForecastSettings | null; onSaved: () => void; onCancel?: () => void;
}) {
  const save = useSaveForecastSettings();
  const qc = useQueryClient();
  const [latitude, setLatitude] = useState(settings ? String(settings.latitude) : '');
  const [longitude, setLongitude] = useState(settings ? String(settings.longitude) : '');
  const [countryCode, setCountryCode] = useState(settings?.countryCode ?? '');
  const [timezone, setTimezone] = useState(settings?.timezone ?? '');
  const [cityQuery, setCityQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [searchRequest, setSearchRequest] = useState<{ q: string; countryCode?: string } | null>(null);
  const [searchHint, setSearchHint] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const searchParams = searchRequest ?? { q: '', countryCode: countryCode || undefined };
  const search = useSearchForecastLocations(searchParams, { query: {
    queryKey: getSearchForecastLocationsQueryKey(searchParams), enabled: searchRequest !== null,
    staleTime: 5 * 60_000, retry: false,
  } });
  const hasCoordinates = latitude !== '' && longitude !== '';
  const showResults = searchRequest !== null && searchRequest.q === cityQuery.trim();
  const startSearch = () => {
    if (cityQuery.trim().length < 2) { setSearchHint('Enter at least two letters of a city name.'); return; }
    setSearchHint('');
    const next = { q: cityQuery.trim(), countryCode: countryCode || undefined };
    if (searchRequest?.q === next.q && searchRequest.countryCode === next.countryCode) void search.refetch();
    else setSearchRequest(next);
  };
  const chooseCity = (city: ForecastLocation) => {
    setLatitude(String(city.latitude)); setLongitude(String(city.longitude));
    setCountryCode(city.countryCode); setTimezone(city.timezone);
    setCityQuery(city.name);
    setSelectedCity([...new Set([city.name, city.region, city.country].filter(Boolean))].join(', '));
    setSearchRequest(null); setSearchHint('');
    save.reset();
  };
  const changeCountry = (value: string) => {
    setCountryCode(value); setTimezone(''); setLatitude(''); setLongitude(''); setSelectedCity('');
    setSearchRequest(null); setSearchHint(''); save.reset();
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasCoordinates) { setManualOpen(true); return; }
    save.mutate({ id: branchId, data: { latitude: Number(latitude), longitude: Number(longitude), countryCode, timezone } }, {
      onSuccess: async () => {
        await qc.invalidateQueries({ queryKey: getGetScoopForecastQueryKey({ branchId }) });
        onSaved();
      },
    });
  };
  const countries = countryCode && !countryOptions.some((option) => option.code === countryCode)
    ? [...countryOptions, { code: countryCode, name: countryCode }] : countryOptions;

  return <form className="stock-form forecast-location" onSubmit={submit} data-testid="form-forecast-settings">
    <div className="form-topline"><div><div className="eyebrow">BRANCH LOCATION</div><h2>{settings ? 'Update forecast location' : `Set up ${branchName}`}</h2></div><MapPin size={21} /></div>
    <p className="forecast-copy">Find your branch’s city to fill its coordinates and timezone automatically. Choose a country to narrow the search.</p>
    <fieldset className="forecast-location-fields" disabled={save.isPending}>
      <div className="form-grid">
        <label>Country<select name="countryCode" required value={countryCode} onChange={(event) => changeCountry(event.target.value)} aria-describedby="forecast-country-hint" data-testid="select-forecast-country">
          <option value="">Choose a country</option>{countries.map((country) => <option key={country.code} value={country.code}>{country.name} ({country.code})</option>)}
        </select><small id="forecast-country-hint">Holiday coverage varies by country.</small></label>
        <label>Timezone<select name="timezone" required value={timezone} onChange={(event) => { setTimezone(event.target.value); save.reset(); }} aria-describedby="forecast-timezone-hint" data-testid="select-forecast-timezone">
          <option value="">Choose a timezone</option>{timezoneOptions(timezone).map((zone) => <option key={zone} value={zone}>{timezoneLabel(zone)}</option>)}
        </select><small id="forecast-timezone-hint">Filled when you choose a city. Adjust it if needed.</small></label>
      </div>
      <div className="forecast-city-search">
        <label htmlFor="forecast-city">Find a city</label>
        <div className="forecast-city-controls"><label className="forecast-city-input"><span className="sr-only">City name</span><input id="forecast-city" type="search" value={cityQuery} maxLength={100} placeholder="For example, Bangkok or Chiang Mai" onChange={(event) => { setCityQuery(event.target.value); setSearchHint(''); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); startSearch(); } }} aria-describedby="forecast-city-hint" data-testid="input-forecast-city" /></label>
          <button type="button" className="button secondary" onClick={startSearch} disabled={search.isFetching} data-testid="button-search-forecast-city">{search.isFetching ? <LoaderCircle size={16} className="spin" /> : <Search size={16} />} Search</button></div>
        <small id="forecast-city-hint">Choose a result below, or enter exact coordinates manually.</small>
        {searchHint && <p className="inline-error" role="alert">{searchHint}</p>}
        {showResults && <div aria-live="polite" aria-busy={search.isFetching}>
          {search.isFetching ? <p className="forecast-copy">Finding cities…</p> : search.isError ? <div className="forecast-notice" role="alert">City search is unavailable. Try again, or enter the coordinates manually below.</div>
            : search.data && <>
              {search.data.status === 'stale' && <p className="forecast-copy">Using saved search results while city search is unavailable.</p>}
              {search.data.locations.length ? <ul className="forecast-city-results" aria-label="Matching cities">{search.data.locations.map((city) => <li key={city.id}><button type="button" onClick={() => chooseCity(city)} data-testid={`forecast-city-${city.id}`}><MapPin size={17} /><span><strong>{city.name}</strong><small>{[...new Set([city.region, city.country].filter(Boolean))].join(', ')} · {timezoneLabel(city.timezone)}</small></span><span className="forecast-city-choose">Choose</span></button></li>)}</ul> : <p className="forecast-copy">No cities found. Try another spelling, a nearby city, or enter coordinates manually.</p>}
            </>}
        </div>}
      </div>
      {hasCoordinates && <div className="forecast-selected-location" role="status" data-testid="forecast-selected-location"><Check size={18} /><span><strong>{selectedCity || 'Branch coordinates'}</strong><small>Latitude {latitude} · Longitude {longitude}</small></span></div>}
      <details className="forecast-coordinate-editor" open={manualOpen} onToggle={(event) => setManualOpen(event.currentTarget.open)}>
        <summary>{hasCoordinates ? 'Adjust exact coordinates' : 'Enter coordinates manually'}</summary>
        <p className="forecast-copy">For a more precise branch location, enter its latitude and longitude.</p>
        <div className="form-grid">
          <label>Latitude<input name="latitude" aria-label="Latitude" type="number" step="any" min="-90" max="90" required value={latitude} onChange={(event) => { setLatitude(event.target.value); setSelectedCity(''); save.reset(); }} placeholder="13.7563" data-testid="input-forecast-latitude" /></label>
          <label>Longitude<input name="longitude" aria-label="Longitude" type="number" step="any" min="-180" max="180" required value={longitude} onChange={(event) => { setLongitude(event.target.value); setSelectedCity(''); save.reset(); }} placeholder="100.5018" data-testid="input-forecast-longitude" /></label>
        </div>
      </details>
      {save.isError && <p className="inline-error" role="alert">Could not save the location. Check the details and try again.</p>}
      <div className="forecast-actions"><button className="button primary" disabled={save.isPending || !hasCoordinates || !countryCode || !timezone} data-testid="button-save-forecast-settings">{save.isPending ? 'Saving…' : 'Save location'}</button>{onCancel && <button type="button" className="button secondary" onClick={onCancel}>Cancel</button>}</div>
    </fieldset>
    <p className="forecast-search-attribution">City search by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> and <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>.</p>
  </form>;
}
