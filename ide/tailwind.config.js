/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        vsc: {
          bg: '#1e1e1e',
          'bg-secondary': '#252526',
          'bg-hover': '#2a2d2e',
          'bg-active': '#37373d',
          'bg-titlebar': '#323233',
          input: '#3c3c3c',
          border: '#474747',
          'border-subtle': '#3c3c3c',
          text: '#cccccc',
          'text-secondary': '#858585',
          'text-muted': '#6a6a6a',
          'text-disabled': '#5a5a5a',
          accent: '#007acc',
          'accent-hover': '#1177bb',
          button: '#0e639c',
          'button-hover': '#1177bb',
          link: '#3794ff',
          success: '#4ec9b0',
          warning: '#cca700',
          error: '#f14c4c',
          selection: '#264f78',
        },
      },
    },
  },
  plugins: [],
}
