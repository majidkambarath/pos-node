exports.createAppError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
};

exports.errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  console.error("Error Stack:", err.stack);

  if (!err.isOperational) {
    console.error("Unexpected Error:", err);

    res.status(500).json({ success: false, message: "Something went wrong!" });
  } else {
    res.status(statusCode).json({
      success: false,
      message,
      error: process.env.NODE_ENV === "development" ? err.stack : message,
    });
  }
};
