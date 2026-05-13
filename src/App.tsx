import { Routes, Route } from 'react-router-dom'
import { FooterChromeProvider } from './components/FooterChromeContext'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { DesignPage } from './pages/DesignPage'
import { ProfilePage } from './pages/ProfilePage'
import { CartPage } from './pages/CartPage'
import { CheckoutPage } from './pages/CheckoutPage'
import { AuthPage } from './pages/AuthPage'

function App() {
  return (
    <FooterChromeProvider>
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/design" element={<DesignPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/auth" element={<AuthPage />} />
      </Route>
    </Routes>
    </FooterChromeProvider>
  )
}

export default App
