import { Routes, Route } from 'react-router'
import ConverterPage from './pages/ConverterPage'
import { PackCreatorPage } from './pages/PackCreatorPage'
import { ConvertPage } from './pages/ConvertPage'
import { MapViewerPage } from './pages/MapViewerPage'
import { MappingGuide } from './pages/MappingGuide'
import { ConversionGuide } from './pages/ConversionGuide'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ConverterPage />} />
      <Route path="/osu-mania-pack-creator" element={<PackCreatorPage />} />
      <Route path="/osu-to-stepmania" element={<ConvertPage />} />
      <Route path="/osu-mania-map-viewer" element={<MapViewerPage />} />
      <Route path="/how-to-make-an-osu-mania-map" element={<MappingGuide />} />
      <Route path="/how-to-convert-osu-mania-to-stepmania" element={<ConversionGuide />} />
    </Routes>
  )
}
