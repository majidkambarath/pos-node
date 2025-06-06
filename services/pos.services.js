const sql = require('mssql');
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
    
    if (error.message.includes('ENOTFOUND')) {
      errorMessage += ": Server not found. Check DB_SERVER in .env file.";
    } else if (error.message.includes('ECONNREFUSED')) {
      errorMessage += ": Connection refused. Is SQL Server running?";
    } else if (error.message.includes('Login failed')) {
      errorMessage += ": Authentication failed. Check credentials.";
    } else if (error.message.includes('Cannot open database')) {
      errorMessage += ": Database access denied. Check database name and permissions.";
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
 * Gets all items with optional filtering (SQL Server 2008 compatible)
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

    // SQL Server 2008 compatible pagination using ROW_NUMBER()
    if (options.limit && !isNaN(options.limit)) {
      const offset = options.offset || 0;
      const limit = parseInt(options.limit);
      
      query = `
        WITH PaginatedResults AS (
          SELECT *, ROW_NUMBER() OVER (ORDER BY ItemName) as RowNum
          FROM tblItemMaster
          ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}
        )
        SELECT * FROM PaginatedResults 
        WHERE RowNum > @offset AND RowNum <= @offset + @limit
        ORDER BY ItemName
      `;
      
      params.push({
        name: "offset",
        type: sql.Int,
        value: offset,
      });
      params.push({
        name: "limit",
        type: sql.Int,
        value: limit,
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

/**
 * Gets all customers with optional filtering (SQL Server 2008 compatible)
 * @param {Object} options - Filter options (search, limit, offset)
 * @returns {Array} Array of customers
 */
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

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    // SQL Server 2008 compatible pagination using ROW_NUMBER()
    if (options.limit && !isNaN(options.limit)) {
      const offset = options.offset || 0;
      const limit = parseInt(options.limit);
      
      query = `
        WITH PaginatedResults AS (
          SELECT *, ROW_NUMBER() OVER (ORDER BY CustName) as RowNum
          FROM tblCustomer
          ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}
        )
        SELECT * FROM PaginatedResults 
        WHERE RowNum > @offset AND RowNum <= @offset + @limit
        ORDER BY CustName
      `;
      
      params.push({
        name: "offset",
        type: sql.Int,
        value: offset,
      });
      params.push({
        name: "limit",
        type: sql.Int,
        value: limit,
      });
    } else {
      query += " ORDER BY CustName";
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

    const query = "SELECT Code, EmpName FROM dbo.tblEmployee WHERE Active=1 ORDER BY EmpName";
    const result = await connectedPool.request().query(query);

    return result.recordset;
  } catch (error) {
    console.error("Error in getAllEmployees:", error.message);
    throw createAppError(`Error fetching employees: ${error.message}`, 500);
  }
};

/**
 * Gets the next available order ID (SQL Server 2008 compatible)
 * @param {Object} transaction - SQL transaction object
 * @returns {Number} Next order ID
 */
const getMaxOrderId = async (transaction) => {
  const query = `SELECT ISNULL(MAX(OrderNo), 0) + 1 AS MaxId FROM tblOrder_M`;
  const result = await transaction.request().query(query);
  return result.recordset[0].MaxId;
};



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
    });
    
    // Parse numeric values
    orderNo = parseInt(orderNo) || 0;
    option = parseInt(option) || 0;
    custId = parseInt(custId) || 0;
    deliveryBoyId = parseInt(deliveryBoyId) || 0;
    tableId = parseInt(tableId) || 0;
    total = parseFloat(total) || 0;

    const connectedPool = await ensureConnection();
    
    const orderType = option === 1 ? "Order" : option === 2 ? "DineIn" : "TakeAway";

    transaction = new sql.Transaction(connectedPool);
    await transaction.begin();
    console.log("Transaction started successfully");

    // **Customer Management Logic**
    if (contact && custName) {
      console.log("Checking customer existence for contact:", contact);
      
      // Check if customer exists by contact number
      const customerCheckQuery = `
        SELECT CustCode, CustName, Add1, Phone 
        FROM dbo.tblCustomer 
        WHERE Phone = @Contact AND Active = 1
      `;
      
      const customerCheckResult = await transaction.request()
        .input("Contact", sql.VarChar, contact)
        .query(customerCheckQuery);

      if (customerCheckResult.recordset.length > 0) {
        // Customer exists - use existing customer ID
        const existingCustomer = customerCheckResult.recordset[0];
        finalCustId = existingCustomer.CustCode;
        console.log("Customer found:", {
          custCode: existingCustomer.CustCode,
          custName: existingCustomer.CustName,
          phone: existingCustomer.Phone
        });
      } else {
        // Customer doesn't exist - create new customer
        console.log("Customer not found, creating new customer");
        
        // SQL Server 2008 compatible - Use @@IDENTITY instead of SCOPE_IDENTITY() in SELECT
        const newCustomerQuery = `
          INSERT INTO dbo.tblCustomer (
            CustName, Add1, Add2, Add3, ContactNo, Phone, Fax, Email, 
            ShowLast, OpBal, UserId, Active, Status, 
            BranchId, FinYear, BrCode, Idd, SlsMode, VatRegNo, VatRegDate
          ) 
          VALUES (
            @CustName, @Add1, NULL, NULL, @ContactNo, @Phone, @Fax, NULL,
            0, 0.00, NULL, 1, 0,
            NULL, NULL, NULL, NULL, 0, NULL, NULL
          )
        `;
        
        await transaction.request()
          .input("CustName", sql.VarChar, custName)
          .input("Add1", sql.VarChar, address || flatNo || "")
          .input("ContactNo", sql.VarChar, contact)
          .input("Phone", sql.VarChar, contact)
          .input("Fax", sql.VarChar, flatNo || "")
          .query(newCustomerQuery);
        
        // Get the inserted customer ID using separate query
        const getNewCustomerIdQuery = `
          SELECT CustCode FROM dbo.tblCustomer 
          WHERE Phone = @Phone AND CustName = @CustName 
          ORDER BY CustCode DESC
        `;
        
        const newCustomerResult = await transaction.request()
          .input("Phone", sql.VarChar, contact)
          .input("CustName", sql.VarChar, custName)
          .query(getNewCustomerIdQuery);
        
        finalCustId = newCustomerResult.recordset[0].CustCode;
        console.log("New customer created with ID:", finalCustId);
      }
    } else {
      console.log("No contact or customer name provided, using custId:", finalCustId);
    }

    if (status === "NEW") {
      const newOrderNo = await getMaxOrderId(transaction);

      // Insert order master with final customer ID
      const orderMasterQuery = `
        INSERT INTO tblOrder_M (EDate, Time, Options, CustId, CustName, Flat, Address, Contact, DelBoy, TableId, TableNo, Remarks, Total, Saled, Status, Prefix, Pr)
        VALUES (@EDate, @Time, @Options, @CustId, @CustName, @Flat, @Address, @Contact, @DelBoy, @TableId, @TableNo, @Remarks, @Total, 'No', @Status, @Prefix, @Pr)
      `;
      
      await transaction.request()
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
        .query(orderMasterQuery);
      
      // Get the inserted order number using separate query
      const getOrderNoQuery = `
        SELECT OrderNo FROM tblOrder_M 
        WHERE EDate = @EDate AND Time = @Time AND CustId = @CustId 
        ORDER BY OrderNo DESC
      `;
      
      const orderNoResult = await transaction.request()
        .input("EDate", sql.VarChar, date)
        .input("Time", sql.VarChar, time)
        .input("CustId", sql.Int, finalCustId || 0)
        .query(getOrderNoQuery);
      
      savedOrderNo = orderNoResult.recordset[0].OrderNo;

      // Process order items
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
        
        await transaction.request()
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

      // Handle printer assignments
      await transaction.request()
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
        
        const printerResult = await transaction.request()
          .input("ItemId", sql.Int, itemId)
          .query(printerQuery);
        
        const printerName = printerResult.recordset[0]?.PrinteName || "";

        await transaction.request()
          .input("OrderNo", sql.Int, savedOrderNo)
          .input("SlNo", sql.Int, slNo)
          .input("ItemId", sql.Int, itemId)
          .input("Printer", sql.VarChar, printerName)
          .query(`
            INSERT INTO tblPrinter (OrderNo, SlNo, ItemId, Printer)
            VALUES (@OrderNo, @SlNo, @ItemId, @Printer)
          `);
      }

      // Update printer for empty printer names
      const orderPrinter = process.env.ORDER_PRINTER || "DefaultPrinter";
      await transaction.request()
        .input("OrderNo", sql.Int, savedOrderNo)
        .input("Printer", sql.VarChar, orderPrinter)
        .query(`
          UPDATE tblPrinter SET Printer = @Printer WHERE Printer = '' AND OrderNo = @OrderNo
        `);

      // Handle dine-in specific logic
      if (option === 2) {
        const counterName = process.env.COUNTER_NAME || "DefaultCounter";
        const seatsQuery = `
          SELECT Seat, SeatId, TableId, Status, Counter FROM tblTemp_Seats WHERE Counter = @Counter
        `;
        
        const seatsResult = await transaction.request()
          .input("Counter", sql.VarChar, counterName)
          .query(seatsQuery);

        for (const seat of seatsResult.recordset) {
          await transaction.request()
            .input("OrderNo", sql.Int, savedOrderNo)
            .input("Seat", sql.VarChar, seat.Seat)
            .input("SeatId", sql.Int, seat.SeatId)
            .input("TableId", sql.Int, seat.TableId)
            .input("Counter", sql.VarChar, counterName)
            .query(`
              INSERT INTO tblOrder_Seats (OrderNo, Seat, SeatId, TableId, Status, Counter)
              VALUES (@OrderNo, @Seat, @SeatId, @TableId, 0, @Counter)
            `);

          await transaction.request()
            .input("SeatId", sql.Int, seat.SeatId)
            .input("TableId", sql.Int, seat.TableId)
            .query(`
              UPDATE tblSeat SET Status = 1 WHERE SeatId = @SeatId AND TableId = @TableId
            `);
        }

        await transaction.request()
          .input("Counter", sql.VarChar, counterName)
          .query(`DELETE FROM tblTemp_Seats WHERE Counter = @Counter`);
      }

      // Update table status for dine-in
      if (tableId && option === 2) {
        const seatCheckQuery = `
          SELECT * FROM tblSeat WHERE TableId = @TableId AND Status = 0
        `;
        
        const seatCheckResult = await transaction.request()
          .input("TableId", sql.Int, tableId)
          .query(seatCheckQuery);

        const tableStatus = seatCheckResult.recordset.length > 0 ? 1 : 2;
        await transaction.request()
          .input("TableId", sql.Int, tableId)
          .input("Status", sql.Int, tableStatus)
          .query(`
            UPDATE tblTable SET Status = @Status WHERE TableId = @TableId
          `);
      }

      // Clean up holded order if needed
      if (holdedOrder) {
        await transaction.request()
          .input("OrderNo", sql.Int, holdedOrder)
          .query(`
            DELETE FROM tblTempOrder_M WHERE OrderNo = @OrderNo;
            DELETE FROM tblTempOrder_D WHERE OrderNo = @OrderNo;
          `);
      }

    } else if (status === "UPDATED") {
      console.log(`Updating existing order: ${orderNo}`);
      
      // First check if order exists
      const orderExistsQuery = `
        SELECT OrderNo FROM tblOrder_M WHERE OrderNo = @OrderNo
      `;
      
      const orderExistsResult = await transaction.request()
        .input("OrderNo", sql.Int, orderNo)
        .query(orderExistsQuery);

      if (orderExistsResult.recordset.length === 0) {
        throw createAppError(`Order ${orderNo} not found`, 404);
      }

      // Update order master
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
          Status = @Status
        WHERE OrderNo = @OrderNo
      `;
      
      await transaction.request()
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
        .query(updateOrderMasterQuery);

      // Delete existing order details and printer records
      await transaction.request()
        .input("OrderNo", sql.Int, orderNo)
        .query(`DELETE FROM tblOrder_D WHERE OrderNo = @OrderNo`);

      await transaction.request()
        .input("OrderNo", sql.Int, orderNo)
        .query(`DELETE FROM tblPrinter WHERE OrderNo = @OrderNo`);

      // Insert updated order items
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
        
        await transaction.request()
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

      // Handle updated printer assignments
      for (const item of items) {
        const itemCode = parseInt(item.itemCode) || 0;
        const slNo = parseInt(item.slNo) || 0;
        const itemId = parseInt(item.itemCode) || 0;

        console.log(`Processing updated printer for item: ${item.itemName}, ItemCode: ${itemCode}`);

        const printerQuery = `
          SELECT PrinteName FROM tblItemMaster WHERE ItemId = @ItemId
        `;
        
        const printerResult = await transaction.request()
          .input("ItemId", sql.Int, itemId)
          .query(printerQuery);
        
        const printerName = printerResult.recordset[0]?.PrinteName || "";

        await transaction.request()
          .input("OrderNo", sql.Int, orderNo)
          .input("SlNo", sql.Int, slNo)
          .input("ItemId", sql.Int, itemId)
          .input("Printer", sql.VarChar, printerName)
          .query(`
            INSERT INTO tblPrinter (OrderNo, SlNo, ItemId, Printer)
            VALUES (@OrderNo, @SlNo, @ItemId, @Printer)
          `);
      }

      // Update printer for empty printer names
      const orderPrinter = process.env.ORDER_PRINTER || "DefaultPrinter";
      await transaction.request()
        .input("OrderNo", sql.Int, orderNo)
        .input("Printer", sql.VarChar, orderPrinter)
        .query(`
          UPDATE tblPrinter SET Printer = @Printer WHERE Printer = '' AND OrderNo = @OrderNo
        `);

      // Update table status if changed
      if (tableId && option === 2) {
        const seatCheckQuery = `
          SELECT * FROM tblSeat WHERE TableId = @TableId AND Status = 0
        `;
        
        const seatCheckResult = await transaction.request()
          .input("TableId", sql.Int, tableId)
          .query(seatCheckQuery);

        const tableStatus = seatCheckResult.recordset.length > 0 ? 1 : 2;
        await transaction.request()
          .input("TableId", sql.Int, tableId)
          .input("Status", sql.Int, tableStatus)
          .query(`
            UPDATE tblTable SET Status = @Status WHERE TableId = @TableId
          `);
      }

      savedOrderNo = orderNo;

    } else if (status === "KOT") {
      // Update table info in order master
      await transaction.request()
        .input("TableId", sql.Int, tableId || 0)
        .input("TableNo", sql.VarChar, tableNo || "")
        .input("OrderNo", sql.Int, orderNo)
        .query(`
          UPDATE tblOrder_M SET TableId = @TableId, TableNo = @TableNo WHERE OrderNo = @OrderNo
        `);

      // Update table status
      if (tableId) {
        await transaction.request()
          .input("TableId", sql.Int, tableId)
          .query(`
            UPDATE tblTable SET Status = 1 WHERE TableId = @TableId
          `);
      }

      // Insert KOT master record
      const kotMasterQuery = `
        INSERT INTO tblKot_M (OrderNo, EDate, Time, Options, CustId, CustName, Flat, Address, Contact, DelBoy, TableId, TableNo, Remarks, Total, Saled, Status)
        VALUES (@OrderNo, @EDate, @Time, @Options, @CustId, @CustName, @Flat, @Address, @Contact, @DelBoy, @TableId, @TableNo, @Remarks, @Total, 'No', @Status)
      `;
      
      await transaction.request()
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

      // Process KOT and order detail items
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

        console.log(`Processing KOT item: ${item.itemName}, ItemCode: ${itemCode}`);

        const kotDetailQuery = `
          INSERT INTO tblKot_D (OrderNo, SlNo, ItemCode, ItemName, Qty, Rate, Amount, Cost, Vat, VatAmt, TaxLedger, Arabic)
          VALUES (@OrderNo, @SlNo, @ItemCode, @ItemName, @Qty, @Rate, @Amount, @Cost, @Vat, @VatAmt, @TaxLedger, @Arabic)
        `;
        
        const orderDetailQuery = `
          INSERT INTO tblOrder_D (OrderNo, SlNo, ItemCode, ItemName, Qty, Rate, Amount, Cost, Vat, VatAmt, TaxLedger, Arabic)
          VALUES (@OrderNo, @SlNo, @ItemCode, @ItemName, @Qty, @Rate, @Amount, @Cost, @Vat, @VatAmt, @TaxLedger, @Arabic)
        `;
        
        const request = transaction.request()
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

      // Handle printer assignments for KOT
      await transaction.request()
        .input("OrderNo", sql.Int, orderNo)
        .query(`DELETE FROM tblPrinter WHERE OrderNo = @OrderNo`);

      for (const item of items) {
        const itemCode = parseInt(item.itemCode) || 0;
        const slNo = parseInt(item.slNo) || 0;
        const itemId = parseInt(item.itemCode) || 0;

        console.log(`Processing KOT printer for item: ${item.itemName}, ItemCode: ${itemCode}`);

        const printerQuery = `
          SELECT PrinteName FROM tblItemMaster WHERE ItemId = @ItemId
        `;
        
        const printerResult = await transaction.request()
          .input("ItemId", sql.Int, itemId)
          .query(printerQuery);
        
        const printerName = printerResult.recordset[0]?.PrinteName || "";

        await transaction.request()
          .input("OrderNo", sql.Int, orderNo)
          .input("SlNo", sql.Int, slNo)
          .input("ItemId", sql.Int, itemId)
          .input("Printer", sql.VarChar, printerName)
          .query(`
            INSERT INTO tblPrinter (OrderNo, SlNo, ItemId, Printer)
            VALUES (@OrderNo, @SlNo, @ItemId, @Printer)
          `);
      }

      // Update printer for empty printer names
      const orderPrinter = process.env.ORDER_PRINTER || "DefaultPrinter";
      await transaction.request()
        .input("OrderNo", sql.Int, orderNo)
        .input("Printer", sql.VarChar, orderPrinter)
        .query(`
          UPDATE tblPrinter SET Printer = @Printer WHERE Printer = '' AND OrderNo = @OrderNo
        `);

    } else {
      throw createAppError("Invalid status. Must be NEW, UPDATED, or KOT.", 400);
    }

    // Commit the transaction
    console.log("Committing transaction...");
    await transaction.commit();
    console.log("Transaction committed successfully");

    return {
      orderNo: savedOrderNo,
      custId: finalCustId,
      message: status === "NEW" ? "Order saved successfully" : 
               status === "UPDATED" ? "Order updated successfully" : 
               "KOT added successfully",
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

/**
 * Gets the latest order number
 * @returns {Object} Object with next order number
 */
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
    throw createAppError(`Error fetching latest order number: ${error.message}`, 500);
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

    const result = await connectedPool.request()
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

    // Base query with joins
    let query = `
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
        t.Status as TableStatus
      FROM dbo.tblOrder_M om
      LEFT JOIN dbo.tblOrder_D od ON om.OrderNo = od.OrderNo
      LEFT JOIN dbo.tblTable t ON om.TableId = t.TableId
    `;
    
    const params = [];
    const conditions = [];

    // Search functionality for OrderNo, CustName, Contact, and Address
    if (options.search) {
      conditions.push("(om.OrderNo LIKE @search OR om.CustName LIKE @search OR om.Contact LIKE @search OR om.Address LIKE @search)");
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
      query += " WHERE " + conditions.join(" AND ");
    }

    // SQL Server 2008 Compatible Pagination using ROW_NUMBER()
    if (options.limit && !isNaN(options.limit)) {
      const offset = options.offset || 0;
      const limit = parseInt(options.limit);
      
      // Wrap the original query with ROW_NUMBER() for pagination
      query = `
        WITH OrderedResults AS (
          SELECT 
            ROW_NUMBER() OVER (ORDER BY om.EDate DESC, om.Time DESC) as RowNum,
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
            t.Status as TableStatus
          FROM dbo.tblOrder_M om
          LEFT JOIN dbo.tblOrder_D od ON om.OrderNo = od.OrderNo
          LEFT JOIN dbo.tblTable t ON om.TableId = t.TableId
          ${conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : ""}
        )
        SELECT 
          OrderNo,
          EDate,
          Time,
          Options,
          CustId,
          CustName,
          Flat,
          Address,
          Contact,
          DelBoy,
          TableId,
          TableNo,
          OrderRemarks,
          Total,
          Saled,
          Status,
          Prefix,
          DetailOrderNo,
          SlNo,
          ItemCode,
          ItemName,
          Qty,
          Rate,
          Amount,
          Cost,
          VatAmt,
          TaxLedger,
          OrderDetailNotes,
          TableTableId,
          FloorNo,
          TableCode,
          TableName,
          Capacity,
          TableRemarks,
          TableStatus
        FROM OrderedResults 
        WHERE RowNum > @offset AND RowNum <= @endRow
      `;
      
      params.push({
        name: "offset",
        type: sql.Int,
        value: offset,
      });
      params.push({
        name: "endRow",
        type: sql.Int,
        value: offset + limit,
      });
    } else {
      // No pagination - just add ORDER BY
      query += " ORDER BY om.EDate DESC, om.Time DESC";
    }

    const request = connectedPool.request();
    params.forEach((param) => {
      request.input(param.name, param.type, param.value);
    });

    const result = await request.query(query);

    // Group the results to structure order with its details and table info
    const ordersMap = new Map();
    
    result.recordset.forEach(row => {
      const orderNo = row.OrderNo;
      
      if (!ordersMap.has(orderNo)) {
        // Create order object with table information
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
          OrderRemarks: row.OrderRemarks,
          Total: row.Total,
          Saled: row.Saled,
          Status: row.Status,
          Prefix: row.Prefix,
          
          // Table information (tblTable)
          tableInfo: row.TableTableId ? {
            TableId: row.TableTableId,
            FloorNo: row.FloorNo,
            TableCode: row.TableCode,
            TableName: row.TableName,
            Capacity: row.Capacity,
            TableRemarks: row.TableRemarks,
            TableStatus: row.TableStatus
          } : null,
          
          // Order details array (tblOrder_D)
          orderDetails: []
        });
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
          OrderDetailNotes: row.OrderDetailNotes
        });
      }
    });

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
    request.input('orderId', sql.Int, orderId);

    const result = await request.query(query);

    if (result.recordset.length === 0) {
      throw createAppError('Order not found', 404);
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
      3: "Takeaway"
    };

    // Initialize response object with all categories set to 0
    const orderCounts = {
      "Delivery": {
        optionValue: 1,
        maxCount: 0,
        nextToken: 1
      },
      "Dine-In": {
        optionValue: 2,
        maxCount: 0,
        nextToken: 1
      },
      "Takeaway": {
        optionValue: 3,
        maxCount: 0,
        nextToken: 1
      }
    };

    // Update with actual data from database
    result.recordset.forEach(row => {
      const optionName = optionMappings[row.Options];
      if (optionName && orderCounts[optionName]) {
        orderCounts[optionName].maxCount = row.MaxCount;
        orderCounts[optionName].nextToken = row.MaxCount + 1;
      }
    });

    return orderCounts;
  } catch (error) {
    console.error("Error in getOrderTokenCounts:", error.message);
    throw createAppError(`Error fetching order token counts: ${error.message}`, 500);
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
  getOrderTokenCounts
};