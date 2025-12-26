import mongoose from "mongoose";

const tradeSchema = new mongoose.Schema({
  ticker: { type: String, required: true },
  date: { type: String, required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  fee: { type: Number, required: true },
  broker: { type: String, required: true },
  currency: { type: String, required: true },
  realisedPL: { type: Number, default: 0 },
}, { timestamps: true });

export const Trade = mongoose.model("Trade", tradeSchema);
