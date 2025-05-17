import express from "express";
import {
  getAllItems,
  getTableSeats,
  getAllCategories,
  getAllEmployees,
  saveOrder,
  latestOrder,
  authLogin
} from "../controllers/posController.js";

const router = express.Router();

router.get("/tables-seats", getTableSeats);
router.get("/items", getAllItems);
router.get("/categories", getAllCategories);
router.get("/employees", getAllEmployees);
router.post("/orders", saveOrder);
router.get("/order/latest", latestOrder);
router.post('/login',authLogin);
export default router;
