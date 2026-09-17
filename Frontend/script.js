const input = document.getElementById('epub-upload');
const fileNameDisplay = document.getElementById('file-name');
const errorMessage = document.getElementById('error-message');
const readBtn = document.getElementById('read-btn');
const viewer = document.getElementById('viewer');
const navButtons = document.querySelector('.nav-buttons');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');

let selectedFile = null;
let rendition = null;

input.addEventListener('change', () => {
  const file = input.files[0];

  if (!file) return;

  const isEpub = file.name.toLowerCase().endsWith('.epub');

  if (!isEpub) {
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

readBtn.addEventListener('click', () => {
  if (!selectedFile) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const arrayBuffer = event.target.result;

    viewer.style.display = 'block';
    navButtons.style.display = 'flex';

    const book = ePub(arrayBuffer);
    rendition = book.renderTo('viewer', {
      width: '100%',
      height: '100%'
    });
    rendition.display();
  };
  reader.readAsArrayBuffer(selectedFile);
});

prevBtn.addEventListener('click', () => {
  if (rendition) rendition.prev();
});

nextBtn.addEventListener('click', () => {
  if (rendition) rendition.next();
});