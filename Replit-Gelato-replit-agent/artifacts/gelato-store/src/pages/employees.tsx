import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Plus, Search, Users, X } from 'lucide-react';
import {
  getListEmployeesQueryKey, useCreateEmployee, useListBranches,
  useListEmployees, useUpdateEmployee,
  type Employee,
} from '@workspace/api-client-react';

type Editor = Employee | 'new' | null;

export function EmployeesPage({ branchId, currentUserId }: { branchId: string; currentUserId: string }) {
  const [editor, setEditor] = useState<Editor>(null);
  const [search, setSearch] = useState('');
  const [formError, setFormError] = useState('');
  const employees = useListEmployees();
  const branches = useListBranches();
  const create = useCreateEmployee();
  const update = useUpdateEmployee();
  const qc = useQueryClient();
  const busy = create.isPending || update.isPending;
  const visible = employees.data?.filter((employee) =>
    employee.branchId === branchId &&
    `${employee.fullName} ${employee.phone} ${employee.role}`.toLowerCase().includes(search.toLowerCase().trim())
  ) ?? [];

  function refresh() {
    qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    setFormError('');
    const values = new FormData(event.currentTarget);
    const data = {
      fullName: String(values.get('fullName')).trim(),
      phone: String(values.get('phone')).trim(),
      role: String(values.get('role')) as 'staff' | 'manager',
      branchId: String(values.get('branchId')),
    };
    const onSuccess = () => { refresh(); setEditor(null); };
    const onError = (error: unknown) => {
      setFormError(error instanceof Error ? error.message : 'Could not save this employee. Please try again.');
    };
    if (editor === 'new') {
      create.mutate({ data: { ...data, password: String(values.get('password')) } }, { onSuccess, onError });
    } else {
      update.mutate({ id: editor.id, data }, { onSuccess, onError });
    }
  }

  function toggleActive(employee: Employee) {
    setFormError('');
    update.mutate({ id: employee.id, data: { isActive: !employee.isActive } }, {
      onSuccess: refresh,
      onError: () => setFormError('Could not change employee status. Please try again.'),
    });
  }

  return <>
    <div className="page-heading"><div><div className="eyebrow">TEAM</div><h1>Employees</h1><p>Manage the people working at this branch.</p></div><div className="heading-action"><button className="button primary" onClick={() => { setFormError(''); setEditor('new'); }} data-testid="button-add-employee"><Plus size={17} /> Add employee</button></div></div>
    <div className="toolbar"><label className="search-box wide-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employees" aria-label="Search employees" data-testid="input-employee-search" /></label><span className="result-hint">{visible.length} employees</span></div>
    {formError && !editor && <p className="inline-error" role="alert">{formError}</p>}
    {employees.isLoading ? <div className="skeleton-stack"><div className="skeleton wide" /><div className="skeleton" /></div> :
      employees.isError ? <div className="state-panel"><CircleAlert size={21} /><strong>Could not load employees.</strong><button className="button secondary" onClick={() => employees.refetch()}>Try again</button></div> :
      visible.length ? <div className="employee-list">{visible.map((employee) => <article className="employee-row" key={employee.id} data-testid={`row-employee-${employee.id}`}>
        <span className="employee-avatar">{employee.fullName.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span>
        <div className="employee-details"><strong>{employee.fullName}</strong><span>{employee.phone} · {employee.branchName}</span></div>
        <span className="employee-role">{employee.role}</span><span className={`employee-status ${employee.isActive ? 'active' : ''}`}>{employee.isActive ? 'Active' : 'Inactive'}</span>
        <div className="employee-actions"><button className="button secondary small-button" onClick={() => { setFormError(''); setEditor(employee); }} data-testid={`button-edit-employee-${employee.id}`}>Edit</button><button className="button secondary small-button" disabled={busy || employee.id === currentUserId} onClick={() => toggleActive(employee)} data-testid={`button-toggle-employee-${employee.id}`}>{employee.isActive ? 'Deactivate' : 'Reactivate'}</button></div>
      </article>)}</div> : <div className="empty-state"><div className="empty-mark"><Users size={22} /></div><strong>No employees found</strong><p>{search ? 'Try another name or phone number.' : 'Add an employee to this branch.'}</p></div>}
    {editor && <div className="modal-backdrop" onClick={() => setEditor(null)}><section className="recipe-modal" role="dialog" aria-modal="true" aria-labelledby="employee-editor-title" onClick={(event) => event.stopPropagation()}>
      <div className="modal-head"><div><div className="eyebrow">TEAM MEMBER</div><h2 id="employee-editor-title">{editor === 'new' ? 'Add employee' : 'Edit employee'}</h2></div><button className="icon-button" aria-label="Close employee form" onClick={() => setEditor(null)}><X size={17} /></button></div>
      <form onSubmit={save} data-testid="form-employee"><div className="form-grid">
        <label>Full name<input name="fullName" required minLength={2} defaultValue={editor === 'new' ? '' : editor.fullName} data-testid="input-employee-name" /></label>
        <label>Phone number<input name="phone" type="tel" required minLength={8} defaultValue={editor === 'new' ? '' : editor.phone} data-testid="input-employee-phone" /></label>
        {editor === 'new' && <label>Password<input name="password" type="password" required minLength={8} autoComplete="new-password" data-testid="input-employee-password" /></label>}
        <label>Role<select name="role" defaultValue={editor === 'new' ? 'staff' : editor.role} data-testid="select-employee-role"><option value="staff">Staff</option><option value="manager">Manager</option></select></label>
        <label>Branch<select name="branchId" required defaultValue={editor === 'new' ? branchId : editor.branchId} data-testid="select-employee-branch">{branches.data?.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      </div>{formError && <p className="inline-error" role="alert">{formError}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={() => setEditor(null)}>Cancel</button><button className="button primary" disabled={busy || branches.isLoading || branches.isError} data-testid="button-save-employee">{busy ? 'Saving…' : 'Save employee'}</button></div></form>
    </section></div>}
  </>;
}
