import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gelatoAuthRouter from "./gelato-auth";
import gelatoStoreRouter from "./gelato-store";
import gelatoOrdersRouter from "./gelato-orders";
import gelatoDashboardRouter from "./gelato-dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gelatoAuthRouter);
router.use(gelatoStoreRouter);
router.use(gelatoOrdersRouter);
router.use(gelatoDashboardRouter);

export default router;
