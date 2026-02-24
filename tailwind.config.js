/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./MyVTuberCameraPreview.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'vtube-bg': '#0f0f23',
        'vtube-accent': '#00ff88',
        'vtube-accent2': '#ff6b9d',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
