const mongoose = require('mongoose');

const supportMessageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    senderRole: {
      type: String,
      enum: ['customer', 'worker', 'admin'],
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const supportTicketSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      unique: true,
    },
    raisedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    raisedByRole: {
      type: String,
      enum: ['customer', 'worker'],
      required: true,
    },
    issue: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'closed'],
      default: 'open',
    },
    messages: [supportMessageSchema],
  },
  { timestamps: true }
);

supportTicketSchema.index({ raisedBy: 1, status: 1 });

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

module.exports = SupportTicket;
