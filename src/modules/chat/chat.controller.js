const asyncHandler = require('../../shared/middleware/async-handler');
const ApiResponse = require('../../shared/utils/api-response');
const chatService = require('./chat.service');

const getMessages = asyncHandler(async (req, res) => {
  const messages = await chatService.getMessages(req.user, req.params.id);
  ApiResponse.ok(res, { messages, count: messages.length }, 'Chat messages retrieved successfully.');
});

const sendMessage = asyncHandler(async (req, res) => {
  const message = await chatService.sendMessage(req.user, req.params.id, req.body.message);

  const io = req.app.get('io');
  const socketStore = req.app.get('socketStore');
  const receiverId = message.receiverId._id
    ? message.receiverId._id.toString()
    : message.receiverId.toString();

  if (io && socketStore) {
    const receiverSocketId = await socketStore.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('chat-message', {
        bookingId: req.params.id,
        message,
      });
    }
  }

  ApiResponse.created(res, { message }, 'Message sent successfully.');
});

module.exports = {
  getMessages,
  sendMessage,
};
