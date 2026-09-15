# NeckHofis IoT Telemetry Hub (Node.js + MongoDB Atlas + ESP8266)

A full-stack IoT backend and real-time dashboard designed for bilateral neck temperature monitoring (dual LM35 via ADS1115) and acoustic zero-crossing frequency analysis using an ESP8266 microcontroller.

![Dashboard Preview](public/preview.png)

---

## 🌟 Features

- **Direct ESP8266 Compatibility**: Native `POST /tempstore` endpoint that seamlessly receives your microcontroller's JSON payload.
- **MongoDB Atlas Storage**: Stores time-stamped sensor telemetry with indexed queries for fast historical lookups.
- **Resilient In-Memory Buffer**: Server continues to function smoothly with an in-memory buffer even before your MongoDB Atlas URI is configured or if the database temporarily disconnects.
- **Rich Cyber-Glassmorphic Dashboard**:
  - **Left Neck Temperature (LM35 Active)** with dynamic normal/fever ranges and °C / °F conversion.
  - **Right Neck Temperature (Estimated)** with clear badge indicating `+0.20°C` mathematical offset due to faulty physical sensor.
  - **Microphone Frequency (Hz)** with zero-crossing acoustic band analysis (vocal fundamental vs friction).
  - **Differential Temperature ($\Delta T$)** and mean neck temperature.
  - **Dual Chart.js Visualizations**: Real-time dual temperature curve (Left vs Right) and acoustic frequency oscillation timeline.
  - **Telemetry Log Table**: Real-time table with relative timestamps, storage engine tags (Atlas vs RAM), and **1-Click CSV Export**.
  - **Built-in Hardware Simulator**: Collapsible test drawer to inject mock packets directly from the web interface without flashing hardware.
- **Render Ready**: Pre-configured for deployment to `https://neckhofis.onrender.com`.

---

## 📁 Project Structure

```
neckhofis/
├── models/
│   └── SensorReading.js    # Mongoose Schema & validation
├── public/
│   ├── index.html          # Semantic HTML5 Dashboard
│   ├── style.css           # Modern cyber-dark glassmorphism stylesheet
│   └── app.js              # Real-time polling, Chart.js & simulator logic
├── .env.example            # Environment variables template
├── .env                    # Local environment variables (PORT, MONGODB_URI)
├── .gitignore              # Git ignore file
├── package.json            # Dependencies and scripts
├── server.js               # Express server, MongoDB connection & REST APIs
└── README.md               # Complete setup & deployment guide
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** (v18 or higher recommended): [Download from nodejs.org](https://nodejs.org/)

### 2. Install Dependencies
Open your terminal in this project directory:
```bash
npm install
```

### 3. Setup MongoDB Atlas
1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Create a free **M0 Sandbox** cluster.
3. In **Database Access**, create a user (e.g. `neckuser`) with read and write permissions and note down the password.
4. In **Network Access**, click **Add IP Address** and select **Allow Access from Anywhere (`0.0.0.0/0`)** (essential for Render cloud deployment and local testing).
5. Click **Connect** > **Drivers** > copy the connection string.
6. Open `.env` and paste your connection string:
   ```env
   PORT=3000
   MONGODB_URI=mongodb+srv://neckuser:YOUR_PASSWORD@cluster0.abcde.mongodb.net/neckhofis?retryWrites=true&w=majority
   ```
   *(Note: If you leave `MONGODB_URI` blank or don't have Atlas set up yet, the server will automatically operate in **In-Memory Mode** without crashing).*

### 4. Run the Server
```bash
npm start
```
Or for auto-reloading during development:
```bash
npm run dev
```

Open **http://localhost:3000** in your browser to view the live dashboard!

---

## 📡 ESP8266 Microcontroller Setup

Your Arduino/ESP8266 code sends data every 2 minutes:
```cpp
const char* SERVER_URL = "https://neckhofis.onrender.com/tempstore";
```

### For Local WiFi Testing:
If testing on your home/office WiFi before cloud deployment:
1. Find your computer's local IP (e.g., `ipconfig` on Windows -> `192.168.1.50`).
2. Update the `SERVER_URL` in your ESP8266 sketch:
   ```cpp
   const char* SERVER_URL = "http://192.168.1.50:3000/tempstore";
   ```
   *(Change `WiFiClientSecure` to standard `WiFiClient` if using local HTTP).*

### For Cloud Testing (Render):
Deploy to Render as shown below, and keep:
```cpp
const char* SERVER_URL = "https://neckhofis.onrender.com/tempstore";
```

---

## 🌐 Deploying to Render.com

1. Initialize git and commit your code:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for NeckHofis IoT Hub"
   ```
2. Push to GitHub.
3. Go to [Render.com](https://render.com) and click **New +** > **Web Service**.
4. Connect your GitHub repository.
5. Configure:
   - **Name**: `neckhofis` (This produces `neckhofis.onrender.com`)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment Variables**:
     - `MONGODB_URI`: Paste your full MongoDB Atlas connection string.
6. Click **Deploy Web Service**. Once live, your ESP8266 and your web browser will connect seamlessly!

---

## 🔌 API Reference

### 1. `POST /tempstore`
Receives telemetry packets from the ESP8266.
- **Request Body**:
  ```json
  {
    "leftTemperature": 36.42,
    "rightTemperature": 36.62,
    "frequency": 134.2
  }
  ```
- **Response** `200 OK`:
  ```json
  {
    "success": true,
    "message": "Telemetry received and recorded successfully.",
    "storage": "mongodb",
    "data": { ... }
  }
  ```

### 2. `GET /api/readings`
Fetch historical telemetry logs (default limit: 50).
- **Query Params**: `?limit=100`

### 3. `GET /api/readings/latest`
Fetch the single latest sensor reading.

### 4. `GET /api/readings/stats`
Computes online/offline status, min/max/average temperatures, frequency, and database health.

### 5. `POST /api/readings/simulate`
Inject a test packet from the dashboard without hardware.

### 6. `DELETE /api/readings`
Purge all historical records for test resets.

### 7. `GET /api/health`
Healthcheck for Render / uptime monitoring.
