const sql = require("mssql");
const { getPool, poolConnect } = require("../config/db");
const { createAppError } = require("../utils/errorHandler");

/**
 * Ensures database connection is available
 * @returns {Promise<Object>} Connected pool instance
 */
const ensureConnection = async () => {
  try {
    // First, wait for the initial connection attempt to complete
    await poolConnect;

    // Then get the current pool
    const pool = await getPool();

    if (!pool) {
      throw new Error("Database pool is not available");
    }

    if (!pool.connected) {
      throw new Error("Database pool is not connected");
    }

    return pool;
  } catch (error) {
    console.error("Database connection error:", error.message);

    // Provide more specific error context
    let errorMessage = "Database connection failed";

    if (error.message.includes("ENOTFOUND")) {
      errorMessage += ": Server not found. Check DB_SERVER in .env file.";
    } else if (error.message.includes("ECONNREFUSED")) {
      errorMessage += ": Connection refused. Is SQL Server running?";
    } else if (error.message.includes("Login failed")) {
      errorMessage += ": Authentication failed. Check credentials.";
    } else if (error.message.includes("Cannot open database")) {
      errorMessage +=
        ": Database access denied. Check database name and permissions.";
    } else {
      errorMessage += `: ${error.message}`;
    }

    throw createAppError(errorMessage, 500);
  }
};
/**
 * Fetches tables and their associated seats
 * @returns {Array} Array of table objects with nested seats
 */
const getTableSeatsData = async () => {
  try {
    const connectedPool = await ensureConnection();

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

    const result = await connectedPool.request().query(query);

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
    console.error("Error in getTableSeatsData:", error.message);
    throw createAppError(`Error fetching table seats: ${error.message}`, 500);
  }
};

/**
 * Gets all items with optional filtering
 * @param {Object} options - Filter options (search, grpId, limit, offset)
 * @returns {Array} Array of items
 */
const getAllItems = async (options = {}) => {
  try {
    const connectedPool = await ensureConnection();

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

    const request = connectedPool.request();
    params.forEach((param) => {
      request.input(param.name, param.type, param.value);
    });

    const result = await request.query(query);

    return result.recordset;
  } catch (error) {
    console.error("Error in getAllItems:", error.message);
    throw createAppError(`Error fetching items: ${error.message}`, 500);
  }
};

const getAllCustomers = async (options = {}) => {
  try {
    const connectedPool = await ensureConnection();

    let query = "SELECT * FROM tblCustomer";
    const params = [];
    const conditions = [];

    // Search functionality for CustName and ContactNo
    if (options.search) {
      conditions.push("(CustName LIKE @search OR ContactNo LIKE @search)");
      params.push({
        name: "search",
        type: sql.VarChar,
        value: `%${options.search}%`,
      });
    }

    // Add WHERE clause if conditions exist
    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    // Order by customer name
    query += " ORDER BY CustName";

    // Add pagination if limit is specified
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

    const request = connectedPool.request();
    params.forEach((param) => {
      request.input(param.name, param.type, param.value);
    });

    const result = await request.query(query);

    return result.recordset;
  } catch (error) {
    console.error("Error in getAllCustomers:", error.message);
    throw createAppError(`Error fetching customers: ${error.message}`, 500);
  }
};
/**
 * Gets all categories
 * @returns {Array} Array of category objects
 */
const getAllCategories = async () => {
  try {
    const connectedPool = await ensureConnection();

    const query = "SELECT * FROM dbo.tblGroup ORDER BY GrpName";
    const result = await connectedPool.request().query(query);

    return result.recordset;
  } catch (error) {
    console.error("Error in getAllCategories:", error.message);
    throw createAppError(`Error fetching categories: ${error.message}`, 500);
  }
};

/**
 * Gets all active employees
 * @returns {Array} Array of employee objects
 */
const getAllEmployees = async () => {
  try {
    const connectedPool = await ensureConnection();

    const query =
      "SELECT Code, EmpName FROM dbo.tblEmployee WHERE Active=1 ORDER BY EmpName";
    const result = await connectedPool.request().query(query);

    return result.recordset;
  } catch (error) {
    console.error("Error in getAllEmployees:", error.message);
    throw createAppError(`Error fetching employees: ${error.message}`, 500);
  }
};

/**
 * Gets the next available order ID
 * @param {Object} transaction - SQL transaction object
 * @returns {Number} Next order ID
 */
const getMaxOrderId = async (transaction) => {
  const query = `SELECT ISNULL(MAX(OrderNo), 0) + 1 AS MaxId FROM tblOrder_M`;
  const result = await transaction.request().query(query);
  return result.recordset[0].MaxId;
};

/**
 * Process an order (new or KOT)
 * @param {Object} orderData - Order details and items
 * @returns {Object} Result with order number and status message
 */

const processOrder = async ({
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
  selectedSeats,
}) => {
  let transaction;
  let savedOrderNo = orderNo;
  let finalCustId = custId;

  try {
    console.log("Received order data:", {
      orderNo,
      status,
      option,
      tableId,
      itemsCount: items?.length || 0,
      contact,
      custName,
      selectedSeats: selectedSeats?.length || 0,
    });

    // Parse numeric values
    orderNo = parseInt(orderNo) || 0;
    option = parseInt(option) || 0;
    custId = parseInt(custId) || 0;
    deliveryBoyId = parseInt(deliveryBoyId) || 0;
    tableId = parseInt(tableId) || 0;
    total = parseFloat(total) || 0;

    const connectedPool = await ensureConnection();

    const orderType =
      option === 1 ? "Order" : option === 2 ? "DineIn" : "TakeAway";

    transaction = new sql.Transaction(connectedPool);
    await transaction.begin();
    console.log("Transaction started successfully");

    // **Optimized Customer Management Logic**
    const handleCustomerManagement = async () => {
      if (["NEW", "UPDATED", "KOT"].includes(status) && custName && contact) {
        // Normalize contact and phone fields
        const normalizedContact = contact.replace(/\D/g, '').padStart(10, '0').slice(-10);
        console.log("Normalized contact for check:", normalizedContact);

        // Check for existing customer with exact match on CustName and ContactNo/Phone
        const customerCheckQuery = `
          SELECT TOP 1 CustCode, CustName, Add1, ContactNo, Phone
          FROM dbo.tblCustomer
          WHERE (ContactNo = @ContactNo OR Phone = @ContactNo)
          AND CustName = @CustName
          AND Active = 1
          ORDER BY CustCode DESC
        `;

        const customerCheckResult = await transaction
          .request()
          .input("ContactNo", sql.VarChar, normalizedContact)
          .input("CustName", sql.VarChar, custName)
          .query(customerCheckQuery);

        if (customerCheckResult.recordset.length > 0) {
          // Customer exists - use and update existing customer
          const existingCustomer = customerCheckResult.recordset[0];
          finalCustId = existingCustomer.CustCode;
          console.log("Customer found:", {
            custCode: existingCustomer.CustCode,
            custName: existingCustomer.CustName,
            contactNo: existingCustomer.ContactNo,
            phone: existingCustomer.Phone,
          });

          // Update existing customer if contact or address differs
          const updateFields = [];
          const updateParams = transaction.request();

          updateParams.input("CustCode", sql.Int, finalCustId);

          if (existingCustomer.ContactNo !== normalizedContact) {
            updateFields.push("ContactNo = @ContactNo");
            updateParams.input("ContactNo", sql.VarChar, normalizedContact);
          }
          if (existingCustomer.Phone !== normalizedContact && !existingCustomer.Phone) {
            updateFields.push("Phone = @Phone");
            updateParams.input("Phone", sql.VarChar, normalizedContact);
          }
          if (existingCustomer.Add1 !== (address || flatNo || "")) {
            updateFields.push("Add1 = @Add1");
            updateParams.input("Add1", sql.VarChar, address || flatNo || "");
          }

          if (updateFields.length > 0) {
            const updateCustomerQuery = `
              UPDATE dbo.tblCustomer
              SET ${updateFields.join(", ")}
              WHERE CustCode = @CustCode
            `;
            await updateParams.query(updateCustomerQuery);
            console.log("Updated existing customer fields:", updateFields);
          }
        } else {
          // Create new customer
          console.log("Creating new customer with:", { custName, normalizedContact });
          const newCustomerQuery = `
            INSERT INTO dbo.tblCustomer (
              CustName, Add1, ContactNo, Phone, Fax, Email, ShowLast, OpBal, TopayCollect,
              UserId, Active, Status, BranchId, FinYear, BrCode, Idd, SlsMode, VatRegNo, VatRegDate, State
            )
            VALUES (
              @CustName, @Add1, @ContactNo, @Phone, @Fax, NULL, 0, 0.00, NULL,
              NULL, 1, 0, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL
            );
            SELECT SCOPE_IDENTITY() AS CustCode;
          `;

          const newCustResult = await transaction
            .request()
            .input("CustName", sql.VarChar, custName)
            .input("Add1", sql.VarChar, address || flatNo || "")
            .input("ContactNo", sql.VarChar, normalizedContact)
            .input("Phone", sql.VarChar, normalizedContact)
            .input("Fax", sql.VarChar, flatNo || "")
            .query(newCustomerQuery);

          finalCustId = newCustResult.recordset[0].CustCode;
          console.log("New customer created with ID:", finalCustId);
        }
      } else {
        console.log("Skipping customer management or insufficient data:", { status, custName, contact });
        finalCustId = custId || 0;
      }
    };

    await handleCustomerManagement();

    // **Helper function to determine SeatId for Order Master**
    const getSeatIdForOrderMaster = () => {
      if (
        selectedSeats &&
        Array.isArray(selectedSeats) &&
        selectedSeats.length > 0
      ) {
        const firstSeatId = parseInt(selectedSeats[0]);
        return firstSeatId && firstSeatId > 0 ? firstSeatId : null;
      }
      return null;
    };

    if (status === "NEW") {
      const newOrderNo = await getMaxOrderId(transaction);
      const seatIdForOrder = getSeatIdForOrderMaster();

      const orderMasterQuery = `
        INSERT INTO tblOrder_M (EDate, Time, Options, CustId, CustName, Flat, Address, Contact, DelBoy, TableId, TableNo, Remarks, Total, Saled, Status, Prefix, Pr, SeatId)
        VALUES (@EDate, @Time, @Options, @CustId, @CustName, @Flat, @Address, @Contact, @DelBoy, @TableId, @TableNo, @Remarks, @Total, 'No', @Status, @Prefix, @Pr, @SeatId)
      `;

      await transaction
        .request()
        .input("EDate", sql.VarChar, date)
        .input("Time", sql.VarChar, time)
        .input("Options", sql.Int, option)
        .input("CustId", sql.Int, finalCustId || 0)
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
        .input("Pr", sql.VarChar, prefix ? `${prefix}${newOrderNo}` : "")
        .input("SeatId", sql.Int, seatIdForOrder)
        .query(orderMasterQuery);

      const getOrderNoQuery = `
        SELECT OrderNo FROM tblOrder_M 
        WHERE EDate = @EDate AND Time = @Time AND CustId = @CustId 
        ORDER BY OrderNo DESC
      `;

      const orderNoResult = await transaction
        .request()
        .input("EDate", sql.VarChar, date)
        .input("Time", sql.VarChar, time)
        .input("CustId", sql.Int, finalCustId || 0)
        .query(getOrderNoQuery);

      savedOrderNo = orderNoResult.recordset[0].OrderNo;

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

        console.log(
          `Processing item: ${item.itemName}, ItemCode: ${itemCode}`
        );

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

      await transaction
        .request()
        .input("OrderNo", sql.Int, savedOrderNo)
        .query(`DELETE FROM tblPrinter WHERE OrderNo = @OrderNo`);

      for (const item of items) {
        const itemCode = parseInt(item.itemCode) || 0;
        const slNo = parseInt(item.slNo) || 0;
        const itemId = parseInt(item.itemCode) || 0;

        console.log(
          `Processing printer for item: ${item.itemName}, ItemCode: ${itemCode}`
        );

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

      const orderPrinter = process.env.ORDER_PRINTER || "DefaultPrinter";
      await transaction
        .request()
        .input("OrderNo", sql.Int, savedOrderNo)
        .input("Printer", sql.VarChar, orderPrinter).query(`
          UPDATE tblPrinter SET Printer = @Printer WHERE Printer = '' AND OrderNo = @OrderNo
        `);

      if (option === 2) {
        if (
          selectedSeats &&
          Array.isArray(selectedSeats) &&
          selectedSeats.length > 0
        ) {
          console.log("Processing selected seats:", selectedSeats);

          for (const seatId of selectedSeats) {
            const parsedSeatId = parseInt(seatId);
            if (parsedSeatId && parsedSeatId > 0) {
              console.log(`Updating seat status for SeatId: ${parsedSeatId}`);

              await transaction
                .request()
                .input("SeatId", sql.Int, parsedSeatId)
                .input("TableId", sql.Int, tableId || 0).query(`
                  UPDATE tblSeat 
                  SET Status = 1 
                  WHERE SeatId = @SeatId AND TableId = @TableId
                `);

              const counterName = process.env.COUNTER_NAME || "DefaultCounter";

              const seatDetailsQuery = `
                SELECT Seat, SeatId, TableId FROM tblSeat 
                WHERE SeatId = @SeatId AND TableId = @TableId
              `;

              const seatDetailsResult = await transaction
                .request()
                .input("SeatId", sql.Int, parsedSeatId)
                .input("TableId", sql.Int, tableId || 0)
                .query(seatDetailsQuery);

              if (seatDetailsResult.recordset.length > 0) {
                const seatDetails = seatDetailsResult.recordset[0];

                await transaction
                  .request()
                  .input("OrderNo", sql.Int, savedOrderNo)
                  .input("Seat", sql.VarChar, seatDetails.Seat)
                  .input("SeatId", sql.Int, seatDetails.SeatId)
                  .input("TableId", sql.Int, seatDetails.TableId)
                  .input("Counter", sql.VarChar, counterName).query(`
                    INSERT INTO tblOrder_Seats (OrderNo, Seat, SeatId, TableId, Status, Counter)
                    VALUES (@OrderNo, @Seat, @SeatId, @TableId, 0, @Counter)
                  `);
              }
            }
          }
        } else {
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
    } else if (status === "UPDATED") {
      console.log(`Updating existing order: ${orderNo}`);

      const orderExistsQuery = `
        SELECT OrderNo, Saled FROM tblOrder_M WHERE OrderNo = @OrderNo
      `;

      const orderExistsResult = await transaction
        .request()
        .input("OrderNo", sql.Int, orderNo)
        .query(orderExistsQuery);

      if (orderExistsResult.recordset.length === 0) {
        throw createAppError(`Order ${orderNo} not found`, 404);
      }

      const currentOrder = orderExistsResult.recordset[0];
      const isSaled = currentOrder.Saled === "Yes";

      let seatIdForOrder = null;
      if (!isSaled) {
        seatIdForOrder = getSeatIdForOrderMaster();
      }

      console.log(
        `Order ${orderNo} - Saled: ${currentOrder.Saled}, SeatId will be: ${seatIdForOrder}`
      );

      const updateOrderMasterQuery = `
        UPDATE tblOrder_M SET 
          EDate = @EDate,
          Time = @Time,
          Options = @Options,
          CustId = @CustId,
          CustName = @CustName,
          Flat = @Flat,
          Address = @Address,
          Contact = @Contact,
          DelBoy = @DelBoy,
          TableId = @TableId,
          TableNo = @TableNo,
          Remarks = @Remarks,
          Total = @Total,
          Status = @Status,
          SeatId = @SeatId
        WHERE OrderNo = @OrderNo
      `;

      await transaction
        .request()
        .input("OrderNo", sql.Int, orderNo)
        .input("EDate", sql.VarChar, date)
        .input("Time", sql.VarChar, time)
        .input("Options", sql.Int, option)
        .input("CustId", sql.Int, finalCustId || 0)
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
        .input("SeatId", sql.Int, seatIdForOrder)
        .query(updateOrderMasterQuery);

      await transaction
        .request()
        .input("OrderNo", sql.Int, orderNo)
        .query(`DELETE FROM tblOrder_D WHERE OrderNo = @OrderNo`);

      await transaction
        .request()
        .input("OrderNo", sql.Int, orderNo)
        .query(`DELETE FROM tblPrinter WHERE OrderNo = @OrderNo`);

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

        console.log(`Updating item: ${item.itemName}, ItemCode: ${itemCode}`);

        const orderDetailQuery = `
          INSERT INTO tblOrder_D (OrderNo, SlNo, ItemCode, ItemName, Qty, Rate, Amount, Cost, Vat, VatAmt, TaxLedger, Arabic, Notes)
          VALUES (@OrderNo, @SlNo, @ItemCode, @ItemName, @Qty, @Rate, @Amount, @Cost, @Vat, @VatAmt, @TaxLedger, @Arabic, @Notes)
        `;

        await transaction
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
          .input("Arabic", sql.NVarChar, item.arabic || "")
          .input("Notes", sql.VarChar, item.notes || "")
          .query(orderDetailQuery);
      }

      for (const item of items) {
        const itemCode = parseInt(item.itemCode) || 0;
        const slNo = parseInt(item.slNo) || 0;
        const itemId = parseInt(item.itemCode) || 0;

        console.log(
          `Processing updated printer for item: ${item.itemName}, ItemCode: ${itemCode}`
        );

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

      const orderPrinter = process.env.ORDER_PRINTER || "DefaultPrinter";
      await transaction
        .request()
        .input("OrderNo", sql.Int, orderNo)
        .input("Printer", sql.VarChar, orderPrinter).query(`
          UPDATE tblPrinter SET Printer = @Printer WHERE Printer = '' AND OrderNo = @OrderNo
        `);

      if (
        option === 2 &&
        !isSaled &&
        selectedSeats &&
        Array.isArray(selectedSeats) &&
        selectedSeats.length > 0
      ) {
        console.log(
          "Processing selected seats for updated order:",
          selectedSeats
        );

        if (tableId) {
          await transaction.request().input("TableId", sql.Int, tableId).query(`
              UPDATE tblSeat SET Status = 0 WHERE TableId = @TableId
            `);
        }

        for (const seatId of selectedSeats) {
          const parsedSeatId = parseInt(seatId);
          if (parsedSeatId && parsedSeatId > 0) {
            console.log(`Updating seat status for SeatId: ${parsedSeatId}`);

            await transaction
              .request()
              .input("SeatId", sql.Int, parsedSeatId)
              .input("TableId", sql.Int, tableId || 0).query(`
                UPDATE tblSeat 
                SET Status = 1 
                WHERE SeatId = @SeatId AND TableId = @TableId
              `);
          }
        }

        await transaction
          .request()
          .input("OrderNo", sql.Int, orderNo)
          .query(`DELETE FROM tblOrder_Seats WHERE OrderNo = @OrderNo`);

        const counterName = process.env.COUNTER_NAME || "DefaultCounter";
        for (const seatId of selectedSeats) {
          const parsedSeatId = parseInt(seatId);
          if (parsedSeatId && parsedSeatId > 0) {
            const seatDetailsQuery = `
              SELECT Seat, SeatId, TableId FROM tblSeat 
              WHERE SeatId = @SeatId AND TableId = @TableId
            `;

            const seatDetailsResult = await transaction
              .request()
              .input("SeatId", sql.Int, parsedSeatId)
              .input("TableId", sql.Int, tableId || 0)
              .query(seatDetailsQuery);

            if (seatDetailsResult.recordset.length > 0) {
              const seatDetails = seatDetailsResult.recordset[0];

              await transaction
                .request()
                .input("OrderNo", sql.Int, orderNo)
                .input("Seat", sql.VarChar, seatDetails.Seat)
                .input("SeatId", sql.Int, seatDetails.SeatId)
                .input("TableId", sql.Int, seatDetails.TableId)
                .input("Counter", sql.VarChar, counterName).query(`
                  INSERT INTO tblOrder_Seats (OrderNo, Seat, SeatId, TableId, Status, Counter)
                  VALUES (@OrderNo, @Seat, @SeatId, @TableId, 0, @Counter)
                `);
            }
          }
        }
      } else if (isSaled) {
        console.log(
          `Order ${orderNo} is already saled, not updating seat assignments`
        );
      }

      if (tableId && option === 2 && !isSaled) {
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

      savedOrderNo = orderNo;
    } else if (status === "KOT") {
      const seatIdForOrder = getSeatIdForOrderMaster();

      await transaction
        .request()
        .input("TableId", sql.Int, tableId || 0)
        .input("TableNo", sql.VarChar, tableNo || "")
        .input("SeatId", sql.Int, seatIdForOrder)
        .input("OrderNo", sql.Int, orderNo).query(`
          UPDATE tblOrder_M SET TableId = @TableId, TableNo = @TableNo, SeatId = @SeatId WHERE OrderNo = @OrderNo
        `);

      await transaction
        .request()
        .input("CustId", sql.Int, finalCustId || 0)
        .input("CustName", sql.VarChar, custName || "")
        .input("Contact", sql.VarChar, contact || "")
        .input("Address", sql.VarChar, address || "")
        .input("Flat", sql.VarChar, flatNo || "")
        .input("OrderNo", sql.Int, orderNo).query(`
          UPDATE tblOrder_M SET 
            CustId = @CustId, 
            CustName = @CustName, 
            Contact = @Contact, 
            Address = @Address, 
            Flat = @Flat 
          WHERE OrderNo = @OrderNo
        `);

      if (
        selectedSeats &&
        Array.isArray(selectedSeats) &&
        selectedSeats.length > 0
      ) {
        console.log("Processing selected seats for KOT:", selectedSeats);

        for (const seatId of selectedSeats) {
          const parsedSeatId = parseInt(seatId);
          if (parsedSeatId && parsedSeatId > 0) {
            console.log(`Updating seat status for KOT SeatId: ${parsedSeatId}`);

            await transaction
              .request()
              .input("SeatId", sql.Int, parsedSeatId)
              .input("TableId", sql.Int, tableId || 0).query(`
                UPDATE tblSeat 
                SET Status = 1 
                WHERE SeatId = @SeatId AND TableId = @TableId
              `);
          }
        }
      } else if (tableId) {
        await transaction.request().input("TableId", sql.Int, tableId).query(`
            UPDATE tblTable SET Status = 1 WHERE TableId = @TableId
          `);
      }

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
        .input("CustId", sql.Int, finalCustId || 0)
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

        console.log(
          `Processing KOT item: ${item.itemName}, ItemCode: ${itemCode}`
        );

        const kotDetailQuery = `
          INSERT INTO tblKot_D (OrderNo, SlNo, ItemCode, ItemName, Qty, Rate, Amount, Cost, Vat, VatAmt, TaxLedger, Arabic, Notes)
          VALUES (@OrderNo, @SlNo, @ItemCode, @ItemName, @Qty, @Rate, @Amount, @Cost, @Vat, @VatAmt, @TaxLedger, @Arabic, @Notes)
        `;

        await transaction
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
          .input("Arabic", sql.NVarChar, item.arabic || "")
          .input("Notes", sql.VarChar, item.notes || "")
          .query(kotDetailQuery);
      }

      await transaction
        .request()
        .input("OrderNo", sql.Int, orderNo)
        .query(`DELETE FROM tblKotPrinter WHERE OrderNo = @OrderNo`);

      for (const item of items) {
        const itemCode = parseInt(item.itemCode) || 0;
        const slNo = parseInt(item.slNo) || 0;
        const itemId = parseInt(item.itemCode) || 0;

        console.log(
          `Processing KOT printer for item: ${item.itemName}, ItemCode: ${itemCode}`
        );

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
            INSERT INTO tblKotPrinter (OrderNo, SlNo, ItemId, Printer)
            VALUES (@OrderNo, @SlNo, @ItemId, @Printer)
          `);
      }

      const kotPrinter = process.env.KOT_PRINTER || "KitchenPrinter";
      await transaction
        .request()
        .input("OrderNo", sql.Int, orderNo)
        .input("Printer", sql.VarChar, kotPrinter).query(`
          UPDATE tblKotPrinter SET Printer = @Printer WHERE Printer = '' AND OrderNo = @OrderNo
        `);

      savedOrderNo = orderNo;
    } else {
      throw createAppError(`Invalid order status: ${status}`, 400);
    }

    await transaction.commit();
    console.log("Transaction committed successfully");

    const result = {
      success: true,
      orderNo: savedOrderNo,
      status: status,
      message: `Order ${status.toLowerCase()} successfully`,
      details: {
        orderType: orderType,
        customerInfo: finalCustId
          ? {
              custId: finalCustId,
              custName: custName,
              contact: contact,
            }
          : null,
        tableInfo: tableId
          ? {
              tableId: tableId,
              tableNo: tableNo,
            }
          : null,
        selectedSeats:
          selectedSeats && selectedSeats.length > 0 ? selectedSeats : null,
        itemsCount: items?.length || 0,
        total: total,
      },
    };

    console.log("Order processing completed:", result);
    return result;
  } catch (error) {
    console.error("Error in processOrder:", error);

    if (transaction) {
      try {
        await transaction.rollback();
        console.log("Transaction rolled back successfully");
      } catch (rollbackError) {
        console.error("Error rolling back transaction:", rollbackError);
      }
    }

    if (error.name === "AppError") {
      throw error;
    }

    if (error.code) {
      switch (error.code) {
        case "EREQUEST":
          throw createAppError(`Database request error: ${error.message}`, 500);
        case "ELOGIN":
          throw createAppError("Database authentication failed", 500);
        case "ECONNRESET":
          throw createAppError("Database connection was reset", 500);
        case "ETIMEOUT":
          throw createAppError("Database operation timed out", 500);
        default:
          throw createAppError(`Database error: ${error.message}`, 500);
      }
    }

    if (error.message && error.message.includes("Cannot insert NULL")) {
      throw createAppError("Missing required field data", 400);
    }

    if (error.message && error.message.includes("Violation of PRIMARY KEY")) {
      throw createAppError("Duplicate order number detected", 409);
    }

    if (error.message && error.message.includes("FOREIGN KEY constraint")) {
      throw createAppError("Invalid reference data provided", 400);
    }

    throw createAppError(
      `Order processing failed: ${error.message || "Unknown error"}`,
      error.status || 500
    );
  }
};




const latestOrder = async () => {
  let transaction;

  try {
    // Get connected pool
    const connectedPool = await ensureConnection();

    // Create a transaction
    transaction = new sql.Transaction(connectedPool);
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
        console.error("Rollback error:", rollbackError);
      }
    }
    console.error("Error in latestOrder:", error.message);
    throw createAppError(
      `Error fetching latest order number: ${error.message}`,
      500
    );
  }
};

/**
 * Authenticates a user
 * @param {String} userName - Username
 * @param {String} password - Password
 * @returns {Object} User information if authenticated
 */
const authenticateUser = async (userName, password) => {
  try {
    const connectedPool = await ensureConnection();

    const query = `
      SELECT UserId, User_Name 
      FROM dbo.tblUser 
      WHERE User_Name = @userName AND Password = @password
    `;

    const result = await connectedPool
      .request()
      .input("userName", userName)
      .input("password", password)
      .query(query);

    if (result.recordset.length === 0) {
      throw createAppError("Invalid username or password", 401);
    }

    return result.recordset[0];
  } catch (error) {
    console.error("Error in authenticateUser:", error.message);
    if (error.statusCode) {
      throw error;
    }
    throw createAppError(`Authentication error: ${error.message}`, 500);
  }
};
const getAllOrders = async (options = {}) => {
  try {
    const connectedPool = await ensureConnection();

    // First query: Get orders with table info and seat info
    let orderQuery = `
      SELECT 
        om.OrderNo,
        om.EDate,
        om.Time,
        om.Options,
        om.CustId,
        om.CustName,
        om.Flat,
        om.Address,
        om.Contact,
        om.DelBoy,
        om.TableId,
        om.TableNo,
        om.Remarks as OrderRemarks,
        om.Total,
        om.Saled,
        om.Status,
        om.Prefix,
        om.SeatId,

        od.OrderNo as DetailOrderNo,
        od.SlNo,
        od.ItemCode,
        od.ItemName,
        od.Qty,
        od.Rate,
        od.Amount,
        od.Cost,
        od.VatAmt,
        od.TaxLedger,
        od.Notes as OrderDetailNotes,

        t.TableId as TableTableId,
        t.FloorNo,
        t.Code as TableCode,
        t.Name as TableName,
        t.Capacity,
        t.Remarks as TableRemarks,
        t.Status as TableStatus,

        s.SeatId as OrderSeatId,
        s.TableId as OrderSeatTableId,
        s.Seat as OrderSeatNumber,
        s.remarks as OrderSeatRemarks,
        s.Status as OrderSeatStatus
      FROM dbo.tblOrder_M om
      LEFT JOIN dbo.tblOrder_D od ON om.OrderNo = od.OrderNo
      LEFT JOIN dbo.tblTable t ON om.TableId = t.TableId
      LEFT JOIN dbo.tblSeat s ON om.SeatId = s.SeatId
    `;

    const params = [];
    const conditions = [];

    // Search functionality for OrderNo, CustName, Contact, and Address
    if (options.search) {
      conditions.push(
        "(om.OrderNo LIKE @search OR om.CustName LIKE @search OR om.Contact LIKE @search OR om.Address LIKE @search)"
      );
      params.push({
        name: "search",
        type: sql.VarChar,
        value: `%${options.search}%`,
      });
    }

    // Filter by Saled status
    if (options.saled !== undefined) {
      conditions.push("om.Saled = @saled");
      params.push({
        name: "saled",
        type: sql.VarChar,
        value: options.saled,
      });
    }

    // Filter by Options
    if (options.options !== undefined) {
      conditions.push("om.Options = @options");
      params.push({
        name: "options",
        type: sql.Int,
        value: options.options,
      });
    }

    // Filter by Customer ID if provided
    if (options.custId !== undefined) {
      conditions.push("om.CustId = @custId");
      params.push({
        name: "custId",
        type: sql.Int,
        value: options.custId,
      });
    }

    // Filter by Table ID if provided
    if (options.tableId !== undefined) {
      conditions.push("om.TableId = @tableId");
      params.push({
        name: "tableId",
        type: sql.Int,
        value: options.tableId,
      });
    }

    // Filter by Seat ID if provided
    if (options.seatId !== undefined) {
      conditions.push("om.SeatId = @seatId");
      params.push({
        name: "seatId",
        type: sql.Int,
        value: options.seatId,
      });
    }

    // Filter by Status if provided
    if (options.status !== undefined) {
      conditions.push("om.Status = @status");
      params.push({
        name: "status",
        type: sql.VarChar,
        value: options.status,
      });
    }

    // Add WHERE clause if conditions exist
    if (conditions.length > 0) {
      orderQuery += " WHERE " + conditions.join(" AND ");
    }

    // Order by date (newest first)
    orderQuery += " ORDER BY om.EDate DESC, om.Time DESC";

    // Add pagination if limit is specified
    if (options.limit && !isNaN(options.limit)) {
      orderQuery += " OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";
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

    // Execute the main order query
    const request1 = connectedPool.request();
    params.forEach((param) => {
      request1.input(param.name, param.type, param.value);
    });

    const orderResult = await request1.query(orderQuery);

    // Group the order results with seat information
    const ordersMap = new Map();
    const tableIds = new Set();

    orderResult.recordset.forEach((row) => {
      const orderNo = row.OrderNo;

      if (!ordersMap.has(orderNo)) {
        // Create order object with table and seat information
        ordersMap.set(orderNo, {
          // Order Master fields (tblOrder_M)
          OrderNo: row.OrderNo,
          EDate: row.EDate,
          Time: row.Time,
          Options: row.Options,
          CustId: row.CustId,
          CustName: row.CustName,
          Flat: row.Flat,
          Address: row.Address,
          Contact: row.Contact,
          DelBoy: row.DelBoy,
          TableId: row.TableId,
          TableNo: row.TableNo,
          SeatId: row.SeatId,
          OrderRemarks: row.OrderRemarks,
          Total: row.Total,
          Saled: row.Saled,
          Status: row.Status,
          Prefix: row.Prefix,

          // Seat information for this specific order (tblSeat)
          seatInfo: row.OrderSeatId
            ? {
                SeatId: row.OrderSeatId,
                TableId: row.OrderSeatTableId,
                SeatNumber: row.OrderSeatNumber,
                SeatRemarks: row.OrderSeatRemarks,
                Status: row.OrderSeatStatus,
              }
            : null,

          // Table information (tblTable)
          tableInfo: row.TableTableId
            ? {
                TableId: row.TableTableId,
                FloorNo: row.FloorNo,
                TableCode: row.TableCode,
                TableName: row.TableName,
                Capacity: row.Capacity,
                TableRemarks: row.TableRemarks,
                TableStatus: row.TableStatus,
                seats: [], // Will be populated from separate query (all seats for this table)
              }
            : null,

          // Order details array (tblOrder_D)
          orderDetails: [],
        });

        // Collect table IDs for seat query (to get all seats for the table)
        if (row.TableTableId) {
          tableIds.add(row.TableTableId);
        }
      }

      // Add order detail if it exists
      if (row.SlNo) {
        ordersMap.get(orderNo).orderDetails.push({
          SlNo: row.SlNo,
          ItemCode: row.ItemCode,
          ItemName: row.ItemName,
          Qty: row.Qty,
          Rate: row.Rate,
          Amount: row.Amount,
          Cost: row.Cost,
          VatAmt: row.VatAmt,
          TaxLedger: row.TaxLedger,
          OrderDetailNotes: row.OrderDetailNotes,
        });
      }
    });

    // Second query: Get all seats for the tables in our orders
    if (tableIds.size > 0) {
      const tableIdsArray = Array.from(tableIds);
      const seatQuery = `
        SELECT 
          SeatId,
          TableId,
          Seat as SeatNumber,
          remarks as SeatRemarks,
          Status as SeatStatus
        FROM dbo.tblSeat 
        WHERE TableId IN (${tableIdsArray
          .map((_, index) => `@tableId${index}`)
          .join(",")})
        ORDER BY TableId, SeatId
      `;

      const request2 = connectedPool.request();
      tableIdsArray.forEach((tableId, index) => {
        request2.input(`tableId${index}`, sql.Int, tableId);
      });

      const seatResult = await request2.query(seatQuery);

      // Group seats by table ID
      const seatsByTable = new Map();
      seatResult.recordset.forEach((seat) => {
        if (!seatsByTable.has(seat.TableId)) {
          seatsByTable.set(seat.TableId, []);
        }
        seatsByTable.get(seat.TableId).push({
          SeatId: seat.SeatId,
          TableId: seat.TableId,
          SeatNumber: seat.SeatNumber,
          SeatRemarks: seat.SeatRemarks,
          Status: seat.SeatStatus,
        });
      });

      // Add all seats to orders (for table information)
      ordersMap.forEach((order) => {
        if (order.tableInfo && seatsByTable.has(order.tableInfo.TableId)) {
          order.tableInfo.seats = seatsByTable.get(order.tableInfo.TableId);
        }
      });
    }

    // Convert map to array
    const orders = Array.from(ordersMap.values());

    return orders;
  } catch (error) {
    console.error("Error in getAllOrders:", error.message);
    throw createAppError(`Error fetching orders: ${error.message}`, 500);
  }
};

// Get order by ID
const getOrderById = async (orderId) => {
  try {
    const connectedPool = await ensureConnection();

    const query = "SELECT * FROM tblOrder_M WHERE OrderId = @orderId";
    const request = connectedPool.request();
    request.input("orderId", sql.Int, orderId);

    const result = await request.query(query);

    if (result.recordset.length === 0) {
      throw createAppError("Order not found", 404);
    }

    return result.recordset[0];
  } catch (error) {
    console.error("Error in getOrderById:", error.message);
    throw createAppError(`Error fetching order: ${error.message}`, 500);
  }
};

const getOrderTokenCounts = async () => {
  try {
    const connectedPool = await ensureConnection();

    // Query to count orders by Options (this gives us the max count)
    const query = `
      SELECT 
        om.Options,
        COUNT(*) as MaxCount
      FROM dbo.tblOrder_M om
      GROUP BY om.Options
    `;

    const request = connectedPool.request();
    const result = await request.query(query);

    // Define option mappings
    const optionMappings = {
      1: "Delivery",
      2: "Dine-In",
      3: "Takeaway",
    };

    // Initialize response object with all categories set to 0
    const orderCounts = {
      Delivery: {
        optionValue: 1,
        maxCount: 0,
        nextToken: 1,
      },
      "Dine-In": {
        optionValue: 2,
        maxCount: 0,
        nextToken: 1,
      },
      Takeaway: {
        optionValue: 3,
        maxCount: 0,
        nextToken: 1,
      },
    };

    // Update with actual data from database
    result.recordset.forEach((row) => {
      const optionName = optionMappings[row.Options];
      if (optionName && orderCounts[optionName]) {
        orderCounts[optionName].maxCount = row.MaxCount;
        orderCounts[optionName].nextToken = row.MaxCount + 1;
      }
    });

    return orderCounts;
  } catch (error) {
    console.error("Error in getOrderTokenCounts:", error.message);
    throw createAppError(
      `Error fetching order token counts: ${error.message}`,
      500
    );
  }
};
module.exports = {
  getTableSeatsData,
  getAllItems,
  getAllCategories,
  getAllEmployees,
  processOrder,
  latestOrder,
  authenticateUser,
  getAllCustomers,
  getAllOrders,
  getOrderTokenCounts,
};
