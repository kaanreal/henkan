import { Helmet } from 'react-helmet-async'

const SITE_URL = 'https://henkan.app'

interface SEOProps {
  title: string
  description: string
  path: string
  image?: string
}

export function SEO({ title, description, path, image = '/og.png' }: SEOProps) {
  const url = `${SITE_URL}${path}`
  const fullTitle = `${title} | Henkan`

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />

      <meta property="og:type" content="website" />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={`${SITE_URL}${image}`} />
      <meta property="og:image:type" content="image/png" />
      <meta property="og:image:width" content="1731" />
      <meta property="og:image:height" content="909" />
      <meta property="og:image:alt" content="Henkan - osu!mania ↔ Etterna converter" />
      <meta property="og:site_name" content="Henkan" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={`${SITE_URL}${image}`} />
      <meta name="twitter:image:alt" content="Henkan - osu!mania ↔ Etterna converter" />

      <meta name="robots" content="index, follow" />
    </Helmet>
  )
}
