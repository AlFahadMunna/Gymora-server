const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");

const healthRoutes = require("./routes/health.routes");
const authRoutes = require("./routes/auth.routes");
const classesRoutes = require("./routes/classes.routes");
const forumRoutes = require("./routes/forum.routes");
const favoritesRoutes = require("./routes/favorites.routes");
const bookingsRoutes = require("./routes/bookings.routes");
const trainerApplicationsRoutes = require("./routes/trainerApplications.routes");
const usersRoutes = require("./routes/users.routes");
const adminRoutes = require("./routes/admin.routes");
const notFound = require("./middlewares/notFound");
const errorHandler = require("./middlewares/errorHandler");

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

app.use("/", healthRoutes);
app.use("/", authRoutes);
app.use("/", classesRoutes);
app.use("/", forumRoutes);
app.use("/", favoritesRoutes);
app.use("/", bookingsRoutes);
app.use("/", trainerApplicationsRoutes);
app.use("/", usersRoutes);
app.use("/", adminRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
