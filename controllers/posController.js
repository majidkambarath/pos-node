import { createAppError } from "../utils/errorHandler.js";
import * as posServices from "../services/pos.services.js";

export const getTableSeats = async (req, res, next) => {
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

export const getAllItems = async (req, res, next) => {
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

export const getAllCategories = async (req, res, next) => {
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
export const getAllEmployees = async (req, res, next) => {
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
export const latestOrder = async (req, res, next) => {
  try {
    const latest = await posServices.latestOrder();

    res.status(200).json({
      success: true,
      message: "latestOrder fetched successfully",
      data: latest,
    });
  } catch (error) {
    next(error);
  }
};
export const saveOrder = async (req, res, next) => {
  try {
    const {
      orderNo,
      status, // 'NEW' or 'KOT'
      date,
      time,
      option, // 1: Delivery, 2: DineIn, 3: TakeAway
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
      items, // Array of order details
      holdedOrder, // For clearing temp order
    } = req.body;

    // Basic validations
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

    if (option === 2 && (!tableId || tableId === "0")) {
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

    // Call service to process the order
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
