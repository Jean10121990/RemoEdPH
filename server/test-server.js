const express = require('express');
const app = express();

// Test basic route
app.get('/test', (req, res) => {
  res.json({ message: 'Test server working!' });
});

// Test route with parameter
app.get('/test/:id', (req, res) => {
  res.json({ message: 'Parameter route working!', id: req.params.id });
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
}); 