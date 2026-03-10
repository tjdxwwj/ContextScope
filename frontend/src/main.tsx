import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'jotai'
import App from './App'
import './style.css'

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <Provider>
      <App />
    </Provider>
  </React.StrictMode>
)
