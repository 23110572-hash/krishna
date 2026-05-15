# Competition Tracker - Setup Guide

## AI Coach Setup (Groq API)

The AI Coach feature requires a Groq API key to function. Follow these steps to set it up:

### 1. Get a Free Groq API Key

1. Visit [https://console.groq.com](https://console.groq.com)
2. Sign up for a free account (or log in if you already have one)
3. Navigate to the "API Keys" section
4. Create a new API key
5. Copy the API key (starts with `gsk_`)

### 2. Add the API Key to Your .env File

1. Open `backend/.env` in your text editor
2. Replace the placeholder with your actual API key:
   ```
   GROQ_API_KEY=gsk_your_actual_api_key_here
   ```
3. Save the file

### 3. Restart the Backend Server

Stop and restart your backend server for the changes to take effect.

### 4. Test the AI Coach

1. Open the Competition Tracker app
2. Click the "AI Coach" button in the bottom-right corner
3. Ask a question about your competitions
4. The AI Coach should respond with helpful suggestions

## Troubleshooting

### Error: "AI Coach not configured"
- Make sure you've added `GROQ_API_KEY` to `backend/.env`
- Verify the API key starts with `gsk_`
- Restart the backend server

### Error: "AI Coach unavailable"
- Your API key may be invalid or expired
- Try generating a new API key from [https://console.groq.com](https://console.groq.com)
- Make sure you haven't exceeded your rate limits on Groq

### Chat box not responding
- Check the browser console (F12) for error messages
- Ensure the backend server is running at the expected URL
- Check the backend logs for API errors

## Features Fixed in This Update

✅ **Removed Recent Competitions section** - The dashboard now shows only Stats and Upcoming Tasks
✅ **Fixed hamburger menu (☰)** - Now properly toggles sidebar on mobile devices
✅ **Improved API key error messages** - Now shows helpful setup instructions instead of cryptic errors
