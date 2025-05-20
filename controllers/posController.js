const { createAppError } = require("../utils/errorHandler");
const posServices = require("../services/pos.services");

const getTableSeats = async (req, res, next) => {
  try {
    const tableSeats = await posServices.getTableSeatsData();
    res.status(200).json({
      success: true,
      message: "Table seats fetched successfully",
      data: tableSeats,
    });
  } catch (error) {
    next(error);
  }
};

const getAllItems = async (req, res, next) => {
  try {
    const { search, limit, offset, grpId } = req.query;
    const items = await posServices.getAllItems({
      search,
      grpId: grpId ? parseInt(grpId) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : 0,
    });

    res.status(200).json({
      success: true,
      message: "Items fetched successfully",
      count: items.length,
      data: items,
    });
  } catch (error) {
    next(error);
  }
};

const getAllCategories = async (req, res, next) => {
  try {
    const categories = await posServices.getAllCategories();
    res.status(200).json({
      success: true,
      message: "Categories fetched successfully",
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    next(error);
  }
};

const getAllEmployees = async (req, res, next) => {
  try {
    const employees = await posServices.getAllEmployees();
    res.status(200).json({
      success: true,
      message: "Employees fetched successfully",
      count: employees.length,
      data: employees,
    });
  } catch (error) {
    next(error);
  }
};

const latestOrder = async (req, res, next) => {
  try {
    const latest = await posServices.latestOrder();
    res.status(200).json({
      success: true,
      message: "Latest order fetched successfully",
      data: latest,
    });
  } catch (error) {
    next(error);
  }
};

const saveOrder = async (req, res, next) => {
  try {
    const {
      orderNo,
      status,
      date,
      time,
      option,
      custId,
      custName,
      flatNo,
      address,
      contact,
      deliveryBoyId,
      tableId,
      tableNo,
      remarks,
      total,
      prefix,
      items,
      holdedOrder,
    } = req.body;

    if (!orderNo || orderNo === "0") {
      return res.status(400).json({
        success: false,
        message: "Click New Button. Order number is required.",
      });
    }

    if (!option || ![1, 2, 3].includes(Number(option))) {
      return res.status(400).json({
        success: false,
        message: "Select an order type (Delivery, DineIn, or TakeAway).",
      });
    }

    if (option === 2 && (!tableNo || tableNo === "0")) {
      return res.status(400).json({
        success: false,
        message: "Select a table for Dine-In.",
      });
    }

    if (option === 1 && !custName) {
      return res.status(400).json({
        success: false,
        message: "Enter or select a customer for Delivery.",
      });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Enter order details.",
      });
    }

    const result = await posServices.processOrder({
      orderNo,
      status,
      date,
      time,
      option,
      custId,
      custName,
      flatNo,
      address,
      contact,
      deliveryBoyId,
      tableId,
      tableNo,
      remarks,
      total,
      prefix,
      items,
      holdedOrder,
    });

    res.status(200).json({
      success: true,
      message: result.message,
      data: { orderNo: result.orderNo },
    });
  } catch (error) {
    next(createAppError(`Saving failed: ${error.message}`, 500));
  }
};

const authLogin = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return next(createAppError("Username and password are required", 400));
    }

    const userData = await posServices.authenticateUser(username, password);

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        userId: userData.UserId,
        userName: userData.User_Name,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTableSeats,
  getAllItems,
  getAllCategories,
  getAllEmployees,
  latestOrder,
  saveOrder,
  authLogin,
};
