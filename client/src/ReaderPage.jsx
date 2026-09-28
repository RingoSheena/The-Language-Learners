import { useEffect, useRef, useState } from 'react';

export default function ReaderPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showReadButton, setShowReadButton] = useState(false);
  const viewerRef = useRef(null);
  const bookRef = useRef(null);
  const renditionRef = useRef(null);

  useEffect(() => {
    return () => {
      if (renditionRef.current) {
        renditionRef.current.destroy();
        renditionRef.current = null;
      }

      if (bookRef.current) {
        bookRef.current.destroy();
        bookRef.current = null;
      }
    };
  }, []);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const isEpub = file.name.toLowerCase().endsWith('.epub') || file.type === 'application/epub+zip';

    if (!isEpub) {
      setErrorMessage('Please upload a valid .epub file.');
      setFileName('');
      setSelectedFile(null);
      setShowReadButton(false);
      event.target.value = '';
      return;
    }

    setErrorMessage('');
    setFileName(`Selected: ${file.name}`);
    setSelectedFile(file);
    setShowReadButton(true);
  };

  const handleRead = () => {
    if (!selectedFile) {
      return;
    }

    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        if (renditionRef.current) {
          renditionRef.current.destroy();
          renditionRef.current = null;
        }

        if (bookRef.current) {
          bookRef.current.destroy();
          bookRef.current = null;
        }

        if (!viewerRef.current) {
          return;
        }

        const arrayBuffer = event.target.result;
        viewerRef.current.innerHTML = '';

        bookRef.current = window.ePub(arrayBuffer);
        renditionRef.current = bookRef.current.renderTo(viewerRef.current, {
          width: '100%',
          height: '100%',
        });

        await renditionRef.current.display();
        setErrorMessage('');
      } catch (error) {
        console.error('Error displaying EPUB:', error);
        setErrorMessage('Unable to open this EPUB file.');
      }
    };

    reader.onerror = () => {
      setErrorMessage('Unable to read this EPUB file.');
    };

    reader.readAsArrayBuffer(selectedFile);
  };

  const handlePrev = () => {
    if (renditionRef.current) {
      renditionRef.current.prev();
    }
  };

  const handleNext = () => {
    if (renditionRef.current) {
      renditionRef.current.next();
    }
  };

  return (
    <div className="reader-shell">
      <h1 className="reader-title">読む</h1>
      <p className="reader-subtitle">Yomu — read, look up, remember.</p>

      <div className="upload-section">
        <label htmlFor="epub-upload" className="upload-btn">
          Upload .epub
        </label>

        <input
          type="file"
          id="epub-upload"
          accept=".epub,application/epub+zip"
          hidden
          onChange={handleFileChange}
        />

        <p id="file-name" className="file-name">{fileName}</p>

        {errorMessage && <p className="error-message">{errorMessage}</p>}

        {showReadButton && (
          <button type="button" className="read-btn" onClick={handleRead}>
            Read
          </button>
        )}
      </div>

      <div className="nav-buttons">
        <button type="button" onClick={handlePrev}>Previous</button>
        <button type="button" onClick={handleNext}>Next</button>
      </div>

      <div ref={viewerRef} className="reader-viewer" />
    </div>
  );
}
