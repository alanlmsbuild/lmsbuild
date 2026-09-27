import { useState } from 'react'
import { formatBytes } from '../burrowCodes'

// Shows an image or video if this browser can display it. If it can't
// (HEIC on Windows, for example), or it's a document, it shows the file's
// original name with a Download button instead of a broken preview.
function FilePreview({ name, contentType, size, src, downloadHref, onRemove, removing = false }) {
  const [failed, setFailed] = useState(false)
  const type = String(contentType ?? '')
  const canTry = src && !failed && (type.startsWith('image/') || type.startsWith('video/'))

  return (
    <div className="burrow-file">
      {canTry && type.startsWith('image/') && (
        <img className="burrow-file-media" src={src} alt={name} onError={() => setFailed(true)} />
      )}
      {canTry && type.startsWith('video/') && (
        <video className="burrow-file-media" src={src} controls preload="metadata" onError={() => setFailed(true)} />
      )}
      <div className="burrow-file-info">
        <span className="burrow-file-name">{name}</span>
        <span className="burrow-muted">
          {formatBytes(size)}
          {(failed || !canTry) && (type.startsWith('image/') || type.startsWith('video/')) && ' · no preview in this browser'}
        </span>
        <div className="burrow-file-actions">
          {downloadHref && (
            <a className="burrow-button-small" href={downloadHref} download={name}>
              Download
            </a>
          )}
          {onRemove && (
            <button type="button" className="burrow-button-small" onClick={onRemove} disabled={removing}>
              {removing ? 'Removing…' : 'Remove'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default FilePreview
