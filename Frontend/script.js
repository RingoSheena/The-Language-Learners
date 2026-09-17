const input = document.getElementById('epub-upload');
const fileNameDisplay = document.getElementById('file-name');
const errorMessage = document.getElementById('error-message');
const readBtn = document.getElementById('read-btn');
const viewer = document.getElementById('viewer');
const navButtons = document.querySelector('.nav-buttons');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');

let selectedFile = null;
let book = null;
let rendition = null;

// Handle EPUB file selection
input.addEventListener('change', () => {
  const file = input.files[0];

  if (!file) {
    return;
  }

  const isEpub =
    file.name.toLowerCase().endsWith('.epub') ||
    file.type === 'application/epub+zip';

  if (!isEpub) {
    errorMessage.textContent = 'Please upload a valid .epub file.';
    errorMessage.style.display = 'block';

    fileNameDisplay.textContent = '';
    readBtn.style.display = 'none';

    selectedFile = null;
    input.value = '';

    return;
  }

  errorMessage.style.display = 'none';
  fileNameDisplay.textContent = `Selected: ${file.name}`;

  selectedFile = file;
  readBtn.style.display = 'inline-block';
});

// Open and display the selected EPUB
readBtn.addEventListener('click', () => {
  if (!selectedFile) {
    return;
  }

  const reader = new FileReader();

  reader.onload = async (event) => {
    try {
      const arrayBuffer = event.target.result;

      // Clean up any previously opened book
      if (rendition) {
        rendition.destroy();
        rendition = null;
      }

      if (book) {
        book.destroy();
        book = null;
      }

      viewer.innerHTML = '';
      viewer.style.display = 'block';
      navButtons.style.display = 'flex';

      // Load the EPUB file
      book = ePub(arrayBuffer);

      // Render the EPUB inside the webpage
      rendition = book.renderTo('viewer', {
        width: '100%',
        height: '100%'
      });

      await rendition.display();

      errorMessage.style.display = 'none';

    } catch (error) {
      console.error('Error displaying EPUB:', error);

      errorMessage.textContent = 'Unable to open this EPUB file.';
      errorMessage.style.display = 'block';

      viewer.style.display = 'none';
      navButtons.style.display = 'none';
    }
  };

  reader.onerror = () => {
    errorMessage.textContent = 'Unable to read this EPUB file.';
    errorMessage.style.display = 'block';

    viewer.style.display = 'none';
    navButtons.style.display = 'none';
  };

  reader.readAsArrayBuffer(selectedFile);
});

// Go to previous page
prevBtn.addEventListener('click', () => {
  if (rendition) {
    rendition.prev();
  }
});

// Go to next page
nextBtn.addEventListener('click', () => {
  if (rendition) {
    rendition.next();
  }
});
