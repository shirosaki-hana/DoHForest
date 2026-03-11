const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const uploadBtn = document.getElementById('uploadBtn');
const message = document.getElementById('message');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');

let selectedFiles = null;

// Format file size
function formatFileSize(bytes) {
  if (bytes === 0) {
    return '0 Bytes';
  }
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
}

// Handle file selection
function handleFiles(files) {
  if (files.length === 0) {
    return;
  }

  selectedFiles = files;

  if (files.length === 1) {
    fileName.textContent = `File: ${files[0].name}`;
    fileSize.textContent = `Size: ${formatFileSize(files[0].size)}`;
  } else {
    fileName.textContent = `${files.length} files selected`;
    let totalSize = 0;
    for (const file of files) {
      totalSize += file.size;
    }
    fileSize.textContent = `Total size: ${formatFileSize(totalSize)}`;
  }

  fileInfo.style.display = 'block';
  uploadBtn.style.display = 'block';
  hideMessage();
}

// Upload area click
uploadArea.addEventListener('click', () => {
  fileInput.click();
});

// File selection
fileInput.addEventListener('change', (e) => {
  handleFiles(e.target.files);
});

// Drag and drop
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  handleFiles(e.dataTransfer.files);
});

// Show message
function showMessage(text, type) {
  message.textContent = text;
  message.style.display = 'block';
  message.setAttribute('data-type', type);
}

function hideMessage() {
  message.style.display = 'none';
}

// File upload
uploadBtn.addEventListener('click', async () => {
  if (!selectedFiles || selectedFiles.length === 0) {
    return;
  }

  uploadBtn.disabled = true;
  progressBar.style.display = 'block';
  hideMessage();

  try {
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const formData = new FormData();
      formData.append('file', file);

      // Update progress
      const progress = ((i + 1) / selectedFiles.length) * 100;
      progressFill.style.width = `${progress}%`;

      try {
        const response = await fetch('/upload', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();

        if (response.ok && result.success) {
          successCount++;
        } else {
          failCount++;
          console.error(`Upload failed: ${file.name}`, result.error);
        }
      } catch (error) {
        failCount++;
        console.error(`Upload failed: ${file.name}`, error);
      }
    }

    // Result message
    if (failCount === 0) {
      showMessage(
        selectedFiles.length === 1
          ? 'File uploaded successfully!'
          : `${successCount} files uploaded successfully!`,
        'success'
      );
    } else if (successCount === 0) {
      showMessage('File upload failed.', 'error');
    } else {
      showMessage(`${successCount} succeeded, ${failCount} failed`, 'error');
    }

    // Reset
    fileInput.value = '';
    selectedFiles = null;
    fileInfo.style.display = 'none';
    uploadBtn.style.display = 'none';
  } catch (error) {
    showMessage('An error occurred during upload.', 'error');
    console.error('Upload error:', error);
  } finally {
    uploadBtn.disabled = false;
    setTimeout(() => {
      progressBar.style.display = 'none';
      progressFill.style.width = '0%';
    }, 1000);
  }
});
