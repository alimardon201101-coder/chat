const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB Atlasga ulanish
const MONGO_URI = process.env.MONGO_URI || "Sizning_MongoDB_Atlas_ConnectionString_ingizni_shu_yerga_yozing";
mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB ga muvaffaqiyatli ulandi!"))
  .catch(err => console.log("Xatolik:", err));

// --- SCHEMALAR ---
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'student' }
});
const User = mongoose.model('User', UserSchema);

const MessageSchema = new mongoose.Schema({
  sender: String,
  recipient: String,
  text: String,
  fileUrl: String,
  createdAt: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', MessageSchema);

// --- MULTER ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const fs = require('fs');
    if (!fs.existsSync('uploads/')) {
      fs.mkdirSync('uploads/');
    }
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Fayl yuklanmadi!" });
  res.json({ fileUrl: `/uploads/${req.file.filename}` });
});

// --- AUTENTIFIKATSIYA ---
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, secretKey } = req.body;

    // Foydalanuvchi mavjudligini tekshirish
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: "Bu foydalanuvchi nomi band!" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let role = 'student';
    if (secretKey === 'f7f420252026') {
      role = 'admin';
    }

    const newUser = new User({ username, password: hashedPassword, role });
    await newUser.save();
    res.json({ message: "Muvaffaqiyatli ro'yxatdan o'tdingiz!" });
  } catch (err) {
    res.status(400).json({ error: "Ro'yxatdan o'tishda xatolik yuz berdi!" });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: "Foydalanuvchi topilmadi!" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Parol noto'g'ri!" });

    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, 'MAXFIY_KALIT_1511', { expiresIn: '7d' });
    res.json({ token, username: user.username, role: user.role });
  } catch (err) {
    res.status(500).json({ error: "Server xatoligi!" });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, 'username role');
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: "Server xatoligi" });
  }
});

app.get('/api/messages/:room', async (req, res) => {
  try {
    const { room } = req.params;
    let query = {};
    if (room === 'general') {
      query = { recipient: 'general' };
    } else {
      query = {
        $or: [
          { sender: req.query.user, recipient: room },
          { sender: room, recipient: req.query.user }
        ]
      };
    }
    const messages = await Message.find(query).sort({ createdAt: 1 });
    res.json(messages);
  } catch (e) {
    res.status(500).json({ error: "Server xatoligi" });
  }
});

// --- SOCKET.IO ---
io.on('connection', (socket) => {
  console.log('Foydalanuvchi ulandi:', socket.id);

  socket.on('join_room', (room) => {
    socket.join(room);
  });

  socket.on('send_message', async (data) => {
    const { sender, recipient, text, fileUrl } = data;
    const newMessage = new Message({ sender, recipient, text, fileUrl });
    await newMessage.save();

    if (recipient === 'general') {
      io.to('general').emit('receive_message', newMessage);
    } else {
      io.emit('receive_message', newMessage);
    }
  });

  socket.on('disconnect', () => {
    console.log('Foydalanuvchi chiqib ketdi');
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server ${PORT}-portda ishlamoqda!`));