import { pool, sql } from "../config/db.js";
import { createAppError } from "../utils/errorHandler.js";

export const getTableSeatsData = async () => {
  try {
    await pool.connect();

    const query = `
      SELECT 
        t.*, 
        s.SeatId, 
        s.Seat AS SeatName,
        s.remarks, 
        s.Status AS SeatStatus
      FROM 
        tblTable t
      LEFT JOIN 
        tblSeat s ON t.TableID = s.TableId
      ORDER BY 
        t.TableID, s.SeatId
    `;

    const result = await pool.request().query(query);

    const tables = [];
    const tableMap = new Map();

    result.recordset.forEach((row) => {
      if (!tableMap.has(row.TableID)) {
        const tableData = { ...row };
        delete tableData.SeatId;
        delete tableData.SeatName;
        delete tableData.remarks;
        delete tableData.SeatStatus;
        tableData.seats = [];
        tables.push(tableData);
        tableMap.set(row.TableID, tableData);
      }

      if (row.SeatId) {
        const seat = {
          SeatId: row.SeatId,
          SeatName: row.SeatName,
          remarks: row.remarks,
          Status: row.SeatStatus,
        };

        tableMap.get(row.TableID).seats.push(seat);
      }
    });

    return tables;
  } catch (error) {
    throw createAppError(`Error fetching table seats: ${error.message}`, 500);
  }
};

export const getAllItems = async (options = {}) => {
  try {
    await pool.connect();

    let query = "SELECT * FROM tblItemMaster";
    const params = [];
    const conditions = [];

    if (options.search) {
      conditions.push("(ItemName LIKE @search OR ItemCode LIKE @search)");
      params.push({
        name: "search",
        type: sql.VarChar,
        value: `%${options.search}%`,
      });
    }

    if (options.grpId !== undefined) {
      conditions.push("GrpId = @grpId");
      params.push({
        name: "grpId",
        type: sql.Int,
        value: options.grpId,
      });
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY ItemName";

    if (options.limit && !isNaN(options.limit)) {
      query += " OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";
      params.push({
        name: "offset",
        type: sql.Int,
        value: options.offset || 0,
      });
      params.push({
        name: "limit",
        type: sql.Int,
        value: parseInt(options.limit),
      });
    }

    const request = pool.request();
    params.forEach((param) => {
      request.input(param.name, param.type, param.value);
    });

    const result = await request.query(query);

    return result.recordset;
  } catch (error) {
    throw createAppError(`Error fetching items: ${error.message}`, 500);
  }
};
export const getAllCategories = async () => {
  try {
    await pool.connect();

    const query = "SELECT * FROM dbo.tblGroup ORDER BY GrpName";
    const result = await pool.request().query(query);

    return result.recordset;
  } catch (error) {
    throw createAppError(`Error fetching categories: ${error.message}`, 500);
  }
};
export const getAllEmployees = async () => {
  try {
    await pool.connect();

    // This is the equivalent SQL query from your VB script
    const query =
      "SELECT Code, EmpName FROM dbo.tblEmployee WHERE Active=1 ORDER BY EmpName";
    const result = await pool.request().query(query);

    return result.recordset;
  } catch (error) {
    throw createAppError(`Error fetching employees: ${error.message}`, 500);
  }
};
const getMaxOrderId = async (transaction) => {
  const query = `SELECT ISNULL(MAX(OrderNo), 0) + 1 AS MaxId FROM tblOrder_M`;
  const result = await transaction.request().query(query);
  return result.recordset[0].MaxId;
};

export const processOrder = async ({
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
}) => {
  let transaction;
  let savedOrderNo = orderNo;

  try {
    console.log("Received order data:", {
      orderNo,
      status,
      option,
      tableId,
      itemsCount: items?.length || 0,
      firstItem: items?.[0] ? JSON.stringify(items[0]) : 'No items'
    });
    console.log(items)
    orderNo = parseInt(orderNo) || 0;
    option = parseInt(option) || 0;
    custId = parseInt(custId) || 0;
    deliveryBoyId = parseInt(deliveryBoyId) || 0;
    tableId = parseInt(tableId) || 0;
    total = parseFloat(total) || 0;
    
    if (!pool.connected) {
      await pool.connect();
    }
    
    const orderType =
      option === 1 ? "Order" : option === 2 ? "DineIn" : "TakeAway";

    
    transaction = new sql.Transaction(pool);
    
    await transaction.begin();
    console.log("Transaction started successfully");

    if (status === "NEW") {
      const newOrderNo = await getMaxOrderId(transaction);
      
      const orderMasterQuery = `
        INSERT INTO tblOrder_M (EDate, Time, Options, CustId, CustName, Flat, Address, Contact, DelBoy, TableId, TableNo, Remarks, Total, Saled, Status, Prefix, Pr)
        VALUES (@EDate, @Time, @Options, @CustId, @CustName, @Flat, @Address, @Contact, @DelBoy, @TableId, @TableNo, @Remarks, @Total, 'No', @Status, @Prefix, @Pr);
        SELECT SCOPE_IDENTITY() AS OrderNo;
      `;
      const orderMasterRequest = transaction
        .request()
        .input("EDate", sql.VarChar, date) // Format: 'DD-MMM-YYYY'
        .input("Time", sql.VarChar, time)
        .input("Options", sql.Int, option)
        .input("CustId", sql.Int, custId || 0)
        .input("CustName", sql.VarChar, custName || "")
        .input("Flat", sql.VarChar, flatNo || "")
        .input("Address", sql.VarChar, address || "")
        .input("Contact", sql.VarChar, contact || "")
        .input("DelBoy", sql.Int, deliveryBoyId || 0)
        .input("TableId", sql.Int, tableId || 0)
        .input("TableNo", sql.VarChar, tableNo || "")
        .input("Remarks", sql.VarChar, remarks || "")
        .input("Total", sql.Decimal(18, 2), total || 0)
        .input("Status", sql.VarChar, orderType)
        .input("Prefix", sql.VarChar, prefix || "")
        .input("Pr", sql.VarChar, prefix ? `${prefix}${newOrderNo}` : "");
      const orderMasterResult = await orderMasterRequest.query(
        orderMasterQuery
      );
      savedOrderNo = orderMasterResult.recordset[0].OrderNo;

      for (const item of items) {
        const itemCode = parseInt(item.itemCode) || 0;
        const slNo = parseInt(item.slNo) || 0;
        const qty = parseFloat(item.qty) || 0;
        const rate = parseFloat(item.rate) || 0;
        const amount = parseFloat(item.amount) || 0;
        const cost = parseFloat(item.cost) || 0;
        const vat = parseFloat(item.vat) || 0;
        const vatAmt = parseFloat(item.vatAmt) || 0;
        const taxLedger = parseInt(item.taxLedger) || 0;
        
        console.log(`Processing item: ${item.itemName}, ItemCode: ${itemCode}, Type: ${typeof itemCode}`);
        
        const orderDetailQuery = `
          INSERT INTO tblOrder_D (OrderNo, SlNo, ItemCode, ItemName, Qty, Rate, Amount, Cost, Vat, VatAmt, TaxLedger, Arabic, Notes)
          VALUES (@OrderNo, @SlNo, @ItemCode, @ItemName, @Qty, @Rate, @Amount, @Cost, @Vat, @VatAmt, @TaxLedger, @Arabic, @Notes)
        `;
        await transaction
          .request()
          .input("OrderNo", sql.Int, savedOrderNo)
          .input("SlNo", sql.Int, slNo)
          .input("ItemCode", sql.Int, itemCode)
          .input("ItemName", sql.VarChar, item.itemName || "")
          .input("Qty", sql.Decimal(18, 2), qty)
          .input("Rate", sql.Decimal(18, 2), rate)
          .input("Amount", sql.Decimal(18, 2), amount)
          .input("Cost", sql.Decimal(18, 2), cost)
          .input("Vat", sql.Decimal(18, 2), vat)
          .input("VatAmt", sql.Decimal(18, 2), vatAmt)
          .input("TaxLedger", sql.Int, taxLedger)
          .input("Arabic", sql.NVarChar, item.arabic || "")
          .input("Notes", sql.VarChar, item.notes || "")
          .query(orderDetailQuery);
      }

      // Handle printer assignmentse
      await transaction
        .request()
        .input("OrderNo", sql.Int, savedOrderNo)
        .query(`DELETE FROM tblPrinter WHERE OrderNo = @OrderNo`);

      for (const item of items) {
        const itemCode = parseInt(item.itemCode) || 0;
        const slNo = parseInt(item.slNo) || 0;
        const itemId = parseInt(item.itemCode) || 0;
        
        console.log(`Processing printer for item: ${item.itemName}, ItemCode: ${itemCode}`);
        
        const printerQuery = `
          SELECT PrinteName FROM tblItemMaster WHERE ItemId = @ItemId
        `;
        const printerResult = await transaction
          .request()
          .input("ItemId", sql.Int, itemId)
          .query(printerQuery);
        const printerName = printerResult.recordset[0]?.PrinteName || "";

        await transaction
          .request()
          .input("OrderNo", sql.Int, savedOrderNo)
          .input("SlNo", sql.Int, slNo)
          .input("ItemId", sql.Int, itemId)
          .input("Printer", sql.VarChar, printerName).query(`
            INSERT INTO tblPrinter (OrderNo, SlNo, ItemId, Printer)
            VALUES (@OrderNo, @SlNo, @ItemId, @Printer)
          `);
      }

      // Update printer for empty printer names
      const orderPrinter = process.env.ORDER_PRINTER || "DefaultPrinter";
      await transaction
        .request()
        .input("OrderNo", sql.Int, savedOrderNo)
        .input("Printer", sql.VarChar, orderPrinter).query(`
          UPDATE tblPrinter SET Printer = @Printer WHERE Printer = '' AND OrderNo = @OrderNo
        `);

      if (option === 2) {
        const counterName = process.env.COUNTER_NAME || "DefaultCounter";
        const seatsQuery = `
          SELECT Seat, SeatId, TableId, Status, Counter FROM tblTemp_Seats WHERE Counter = @Counter
        `;
        const seatsResult = await transaction
          .request()
          .input("Counter", sql.VarChar, counterName)
          .query(seatsQuery);

        for (const seat of seatsResult.recordset) {
          await transaction
            .request()
            .input("OrderNo", sql.Int, savedOrderNo)
            .input("Seat", sql.VarChar, seat.Seat)
            .input("SeatId", sql.Int, seat.SeatId)
            .input("TableId", sql.Int, seat.TableId)
            .input("Counter", sql.VarChar, counterName).query(`
              INSERT INTO tblOrder_Seats (OrderNo, Seat, SeatId, TableId, Status, Counter)
              VALUES (@OrderNo, @Seat, @SeatId, @TableId, 0, @Counter)
            `);

          await transaction
            .request()
            .input("SeatId", sql.Int, seat.SeatId)
            .input("TableId", sql.Int, seat.TableId).query(`
              UPDATE tblSeat SET Status = 1 WHERE SeatId = @SeatId AND TableId = @TableId
            `);
        }

        await transaction
          .request()
          .input("Counter", sql.VarChar, counterName)
          .query(`DELETE FROM tblTemp_Seats WHERE Counter = @Counter`);
      }

      if (tableId && option === 2) {
        const seatCheckQuery = `
          SELECT * FROM tblSeat WHERE TableId = @TableId AND Status = 0
        `;
        const seatCheckResult = await transaction
          .request()
          .input("TableId", sql.Int, tableId)
          .query(seatCheckQuery);

        const tableStatus = seatCheckResult.recordset.length > 0 ? 1 : 2;
        await transaction
          .request()
          .input("TableId", sql.Int, tableId)
          .input("Status", sql.Int, tableStatus).query(`
            UPDATE tblTable SET Status = @Status WHERE TableId = @TableId
          `);
      }

      if (holdedOrder) {
        await transaction.request().input("OrderNo", sql.Int, holdedOrder)
          .query(`
            DELETE FROM tblTempOrder_M WHERE OrderNo = @OrderNo;
            DELETE FROM tblTempOrder_D WHERE OrderNo = @OrderNo;
          `);
      }

      // TODO: Implement printing logic (replace CRYSTAL_PRINT)
      // Example: await printService.printOrder(savedOrderNo);

    } else if (status === "KOT") {
      // Handle KOT logic
      // Update tblOrder_M
      await transaction
        .request()
        .input("TableId", sql.Int, tableId || 0)
        .input("TableNo", sql.VarChar, tableNo || "")
        .input("OrderNo", sql.Int, orderNo).query(`
          UPDATE tblOrder_M SET TableId = @TableId, TableNo = @TableNo WHERE OrderNo = @OrderNo
        `);

      // Update table status
      if (tableId) {
        await transaction.request().input("TableId", sql.Int, tableId).query(`
            UPDATE tblTable SET Status = 1 WHERE TableId = @TableId
          `);
      }

      // Insert into tblKot_M
      const kotMasterQuery = `
        INSERT INTO tblKot_M (OrderNo, EDate, Time, Options, CustId, CustName, Flat, Address, Contact, DelBoy, TableId, TableNo, Remarks, Total, Saled, Status)
        VALUES (@OrderNo, @EDate, @Time, @Options, @CustId, @CustName, @Flat, @Address, @Contact, @DelBoy, @TableId, @TableNo, @Remarks, @Total, 'No', @Status)
      `;
      await transaction
        .request()
        .input("OrderNo", sql.Int, orderNo)
        .input("EDate", sql.VarChar, date)
        .input("Time", sql.VarChar, time)
        .input("Options", sql.Int, option)
        .input("CustId", sql.Int, custId || 0)
        .input("CustName", sql.VarChar, custName || "")
        .input("Flat", sql.VarChar, flatNo || "")
        .input("Address", sql.VarChar, address || "")
        .input("Contact", sql.VarChar, contact || "")
        .input("DelBoy", sql.Int, deliveryBoyId || 0)
        .input("TableId", sql.Int, tableId || 0)
        .input("TableNo", sql.VarChar, tableNo || "")
        .input("Remarks", sql.VarChar, remarks || "")
        .input("Total", sql.Decimal(18, 2), total || 0)
        .input("Status", sql.VarChar, orderType)
        .query(kotMasterQuery);

      // Insert into tblKot_D and tblOrder_D
      for (const item of items) {
        // Convert and validate item values
        const itemCode = parseInt(item.itemCode) || 0;
        const slNo = parseInt(item.slNo) || 0;
        const qty = parseFloat(item.qty) || 0;
        const rate = parseFloat(item.rate) || 0;
        const amount = parseFloat(item.amount) || 0;
        const cost = parseFloat(item.cost) || 0;
        const vat = parseFloat(item.vat) || 0;
        const vatAmt = parseFloat(item.vatAmt) || 0;
        const taxLedger = parseInt(item.taxLedger) || 0;
        
        console.log(`Processing KOT item: ${item.itemName}, ItemCode: ${itemCode}`);
        
        const kotDetailQuery = `
          INSERT INTO tblKot_D (OrderNo, SlNo, ItemCode, ItemName, Qty, Rate, Amount, Cost, Vat, VatAmt, TaxLedger, Arabic)
          VALUES (@OrderNo, @SlNo, @ItemCode, @ItemName, @Qty, @Rate, @Amount, @Cost, @Vat, @VatAmt, @TaxLedger, @Arabic)
        `;
        const orderDetailQuery = `
          INSERT INTO tblOrder_D (OrderNo, SlNo, ItemCode, ItemName, Qty, Rate, Amount, Cost, Vat, VatAmt, TaxLedger, Arabic)
          VALUES (@OrderNo, @SlNo, @ItemCode, @ItemName, @Qty, @Rate, @Amount, @Cost, @Vat, @VatAmt, @TaxLedger, @Arabic)
        `;
        const request = transaction
          .request()
          .input("OrderNo", sql.Int, orderNo)
          .input("SlNo", sql.Int, slNo)
          .input("ItemCode", sql.Int, itemCode)
          .input("ItemName", sql.VarChar, item.itemName || "")
          .input("Qty", sql.Decimal(18, 2), qty)
          .input("Rate", sql.Decimal(18, 2), rate)
          .input("Amount", sql.Decimal(18, 2), amount)
          .input("Cost", sql.Decimal(18, 2), cost)
          .input("Vat", sql.Decimal(18, 2), vat)
          .input("VatAmt", sql.Decimal(18, 2), vatAmt)
          .input("TaxLedger", sql.Int, taxLedger)
          .input("Arabic", sql.NVarChar, item.arabic || "");
        await request.query(kotDetailQuery);
        await request.query(orderDetailQuery);
      }

      // Handle printer assignments
      await transaction
        .request()
        .input("OrderNo", sql.Int, orderNo)
        .query(`DELETE FROM tblPrinter WHERE OrderNo = @OrderNo`);

      for (const item of items) {
        // Convert and validate item values
        const itemCode = parseInt(item.itemCode) || 0;
        const slNo = parseInt(item.slNo) || 0;
        const itemId = parseInt(item.itemCode) || 0;
        
        console.log(`Processing KOT printer for item: ${item.itemName}, ItemCode: ${itemCode}`);
        
        const printerQuery = `
          SELECT PrinteName FROM tblItemMaster WHERE ItemId = @ItemId
        `;
        const printerResult = await transaction
          .request()
          .input("ItemId", sql.Int, itemId)
          .query(printerQuery);
        const printerName = printerResult.recordset[0]?.PrinteName || "";

        await transaction
          .request()
          .input("OrderNo", sql.Int, orderNo)
          .input("SlNo", sql.Int, slNo)
          .input("ItemId", sql.Int, itemId)
          .input("Printer", sql.VarChar, printerName).query(`
            INSERT INTO tblPrinter (OrderNo, SlNo, ItemId, Printer)
            VALUES (@OrderNo, @SlNo, @ItemId, @Printer)
          `);
      }

      // Update printer for empty printer names
      const orderPrinter = process.env.ORDER_PRINTER || "DefaultPrinter";
      await transaction
        .request()
        .input("OrderNo", sql.Int, orderNo)
        .input("Printer", sql.VarChar, orderPrinter).query(`
          UPDATE tblPrinter SET Printer = @Printer WHERE Printer = '' AND OrderNo = @OrderNo
        `);

      // TODO: Implement printing logic (replace CRYSTAL_PRINT)
      // Example: await printService.printOrder(orderNo);
    } else {
      throw createAppError("Invalid status. Must be NEW or KOT.", 400);
    }

    // Explicitly commit the transaction
    console.log("Committing transaction...");
    await transaction.commit();
    console.log("Transaction committed successfully");

    return { 
      orderNo: savedOrderNo, 
      message: status === "NEW" ? "Order saved successfully" : "KOT added successfully" 
    };
  } catch (error) {
    console.error("Transaction error:", error.message);
    // Handle transaction rollback
    if (transaction) {
      try {
        console.log("Rolling back transaction...");
        await transaction.rollback();
        console.log("Transaction rolled back successfully");
      } catch (rollbackError) {
        console.error("Transaction rollback failed:", rollbackError.message);
      }
    }
    throw error;
  }
};


export const latestOrder = async () => {
  let transaction;
  try {
    // Connect to the database
    await pool.connect();
    
    // Create a transaction
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    
    // Fetch the next order number
    const nextOrderNo = await getMaxOrderId(transaction);
    
    // Commit the transaction
    await transaction.commit();
    
    // Return the order number as an object to match frontend expectation
    return { orderNo: String(nextOrderNo) };
  } catch (error) {
    // Rollback transaction on error
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('Rollback error:', rollbackError);
      }
    }
    throw createAppError(`Error fetching latest order number: ${error.message}`, 500);
  } finally {
    // Release the connection
    try {
      await pool.close();
    } catch (closeError) {
      console.error('Error closing pool:', closeError);
    }
  }
};