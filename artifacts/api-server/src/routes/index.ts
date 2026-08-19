import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import profileRouter from "./profile";
import materialsRouter from "./materials";
import groupsRouter from "./groups";
import quizRouter from "./quiz";
import shopRouter from "./shop";
import ticketsRouter from "./tickets";
import leaderboardRouter from "./leaderboard";
import socialRouter from "./social";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(profileRouter);
router.use(materialsRouter);
router.use(groupsRouter);
router.use(quizRouter);
router.use(shopRouter);
router.use(ticketsRouter);
router.use(leaderboardRouter);
router.use(socialRouter);

export default router;
