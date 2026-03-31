/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        remo: {
          green: '#0d9488',
          'green-light': '#5eead4',
          blue: '#2563eb',
          'blue-soft': '#93c5fd',
          yellow: '#eab308',
          'yellow-soft': '#fef08a',
          ink: '#0f172a',
          muted: '#64748b'
        }
      },
      boxShadow: {
        remo: '0 4px 24px -4px rgba(37, 99, 235, 0.12), 0 8px 32px -8px rgba(13, 148, 136, 0.15)'
      }
    }
  },
  plugins: []
};
