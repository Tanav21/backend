const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');

router.post('/chat-file', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  res.json({
    fileName: req.file.originalname,
    fileUrl: `/uploads/chat-files/${req.file.filename}`,
  });
});

module.exports = router;
