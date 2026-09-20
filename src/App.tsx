import { Routes, Route } from 'react-router'
import ConverterPage from './pages/ConverterPage'
import { PackCreatorPage } from './pages/PackCreatorPage'
import { ConvertPage } from './pages/ConvertPage'
import { MapViewerPage } from './pages/MapViewerPage'
import { MappingGuide } from './pages/MappingGuide'
import { ConversionGuide } from './pages/ConversionGuide'
import { SkinConverterPage } from './pages/SkinConverterPage'
import { OsuLibraryPage } from './pages/OsuLibraryPage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ConverterPage />} />
      <Route path="/osu-mania-pack-creator" element={<PackCreatorPage />} />
      <Route path="/osu-to-stepmania" element={<ConvertPage />} />
      <Route path="/osu-mania-map-viewer" element={<MapViewerPage />} />
      <Route path="/skin-converter" element={<SkinConverterPage />} />
      <Route path="/osu-library" element={<OsuLibraryPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/how-to-make-an-osu-mania-map" element={<MappingGuide />} />
      <Route path="/how-to-convert-osu-mania-to-stepmania" element={<ConversionGuide />} />
    </Routes>
  )
}
