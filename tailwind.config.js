/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html',
    './js/**/*.js',
  ],
  // Only safelist classes that are assembled dynamically at runtime
  // (static scanning won't find them because they're in ternary expressions)
  safelist: [
    'opacity-100', 'opacity-50',
    'border-green-700', 'border-red-900',
    'text-green-400', 'text-red-400', 'text-yellow-400',
    'text-green-300', 'text-amber-300',
    'bg-green-500', 'bg-gray-700',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      colors: {
        terminal: {
          green: '#00ff41',
          amber: '#ffb000',
          dim:   '#003b00',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'scan':       'scan 8s linear infinite',
      },
      keyframes: {
        scan: {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
      },
    },
  },
  plugins: [],
};
