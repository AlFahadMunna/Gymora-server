// Centralized error handler. Route handlers should call next(err) (or throw
// inside an async wrapper) instead of building their own error responses, so
// every API error comes back to the client in this same shape.
function errorHandler(err, req, res, next) {
  console.error(err);

  const status = err.status || err.statusCode || 500;

  res.status(status).json({
    success: false,
    message: err.message || "Something went wrong on the server",
  });
}

module.exports = errorHandler;
