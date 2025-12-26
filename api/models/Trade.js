import mongoose from "mongoose";

const tradeSchema = new mongoose.Schema({
  symbol: String,
  price: Number,
  amount: Number,
  fee: Number,
  date: { type: Date, default: Date.now },
});

export const Trade = mongoose.models.Trade || mongoose.model("Trade", tradeSchema);
