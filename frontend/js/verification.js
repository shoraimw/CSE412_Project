window.driveUploadVerificationDocument = async function(applicationType, documentType, file, vehicleId) {
  if (!file) throw new Error('Choose a document file first.');
  if (!['image/jpeg','image/png','application/pdf'].includes(file.type)) throw new Error('Only JPG, PNG and PDF files are accepted.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Each file must be 10 MB or smaller.');
  const signed = await driveRequest('/verification/upload-url', {
    method:'POST',
    body:JSON.stringify({applicationType,documentType,fileName:file.name,contentType:file.type,size:file.size,vehicleId})
  });
  const upload = await fetch(signed.signedUrl, {
    method:'PUT',
    headers:{'Content-Type':file.type,'x-upsert':'false'},
    body:file
  });
  if (!upload.ok) {
    const detail = await upload.text().catch(()=> '');
    throw new Error('Secure document upload failed ('+upload.status+'). '+detail.slice(0,180));
  }
  const saved = await driveRequest('/verification/documents', {
    method:'POST',
    body:JSON.stringify({applicationType,documentType,storagePath:signed.path,vehicleId})
  });
  return saved.document;
};
window.driveVerificationStatus = function(status) {
  return String(status||'pending').replaceAll('_',' ');
};
