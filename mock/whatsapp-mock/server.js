const express = require("express");
const app = express();
const PORT = 9090;

app.use(express.json());

// Store sent messages for inspection
const sentMessages = [];

// WhatsApp Cloud API mock — send message
app.post("/v21.0/:phoneNumberId/messages", (req, res) => {
  const message = {
    id: `wamid.${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
    phoneNumberId: req.params.phoneNumberId,
    to: req.body.to,
    type: req.body.type,
    template: req.body.template,
    timestamp: new Date().toISOString(),
  };
  sentMessages.push(message);
  console.log(`[MOCK] Message sent to ${req.body.to}: ${message.id}`);
  res.json({
    messaging_product: "whatsapp",
    contacts: [{ input: req.body.to, wa_id: req.body.to }],
    messages: [{ id: message.id }],
  });
});

// Inspect sent messages
app.get("/mock/messages", (_req, res) => {
  res.json(sentMessages);
});

// Clear sent messages
app.delete("/mock/messages", (_req, res) => {
  sentMessages.length = 0;
  res.json({ cleared: true });
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`WhatsApp Mock Server running on port ${PORT}`);
});
