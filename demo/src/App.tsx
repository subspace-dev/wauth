import { useEffect, useState } from "react"
import HomePage from "./components/HomePage"
import SettingsPage from "./components/EncryptPage"

function App() {
  const [currentRoute, setCurrentRoute] = useState<string>('home')

  // Handle hash routing
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1) || 'home'
      setCurrentRoute(hash)
    }

    // Set initial route
    handleHashChange()

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const navigate = (route: string) => {
    window.location.hash = route
    setCurrentRoute(route)
  }

  // Render the appropriate component based on current route
  const renderCurrentPage = () => {
    switch (currentRoute) {
      case 'encrypt':
        return <SettingsPage navigate={navigate} />
      case 'home':
      default:
        return <HomePage navigate={navigate} />
    }
  }

  return renderCurrentPage()
}

export default App