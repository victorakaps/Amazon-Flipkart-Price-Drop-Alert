const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
    },
    userid: {
      type: Number,
      required: true,
    },
    name: {
      type: String,
      required: false,
      default: "",
    },
    initPrice: {
      type: Number,
      required: true,
    },
    dropPrice: {
      type: Number,
      required: true,
    },
    anydrop: {
      type: Boolean,
      required: false,
      default: false,
    },
    email: {
      type: String,
      required: true,
    },
    uniqid: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Product", productSchema);
