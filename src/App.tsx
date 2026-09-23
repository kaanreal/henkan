import { Routes, Route } from 'react-router'
import { useEffect } from 'react'
import { Navigate } from 'react-router'
import { useLocation } from 'react-router'
import ConverterPage from './pages/ConverterPage'
import { PackCreatorPage } from './pages/PackCreatorPage'
import { ConvertPage } from './pages/ConvertPage'
import { MapViewerPage } from './pages/MapViewerPage'
import { SkinConverterPage } from './pages/SkinConverterPage'
import { OsuLibraryPage } from './pages/OsuLibraryPage'
import { SettingsPage } from './pages/SettingsPage'
import { DocsPage } from './pages/DocsPage'
import { scrollAppToTop } from './lib/appScroll'

function ScrollToTop() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    scrollAppToTop()
  }, [pathname, search])

  return null
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
      <Route path="/" element={<ConverterPage />} />
      <Route path="/osu-mania-pack-creator" element={<PackCreatorPage />} />
      <Route path="/osu-to-stepmania" element={<ConvertPage />} />
      <Route path="/osu-mania-map-viewer" element={<MapViewerPage />} />
      <Route path="/skin-converter" element={<SkinConverterPage />} />
      <Route path="/osu-library" element={<OsuLibraryPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/docs" element={<DocsPage />} />
      <Route path="/how-to-make-an-osu-mania-map" element={<Navigate to="/docs" replace />} />
      <Route path="/how-to-convert-osu-mania-to-stepmania" element={<Navigate to="/docs#convert-a-map" replace />} />
      </Routes>
    </>
  )
}
