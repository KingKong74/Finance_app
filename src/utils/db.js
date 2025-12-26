import mongoose from "mongoose";

const MONGO_URI = "mongodb+srv://baileyking37_db_user:9XPcVKwFtNjdzdQj@cluster0.ppcbvfr.mongodb.net/ledgerDB?retryWrites=true&w=majority";

export const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
};
