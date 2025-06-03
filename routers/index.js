const express = require("express");
const {
  getAllItems,
  getTableSeats,
  getAllCategories,
  getAllEmployees,
  saveOrder,
  latestOrder,
  authLogin,
  getAllCustomers,
  getPendingOrders,
  getOrderTokenCounts,
} = require("../controllers/posController.js");

const router = express.Router();

router.get("/tables-seats", getTableSeats);
router.get("/items", getAllItems);
router.get("/customers", getAllCustomers);
router.get("/pending", getPendingOrders);
router.get("/categories", getAllCategories);
router.get("/employees", getAllEmployees);
router.get("/token-counts",getOrderTokenCounts );
router.post("/orders", saveOrder);
router.get("/order/latest", latestOrder);
router.post("/login", authLogin);

module.exports = router;
