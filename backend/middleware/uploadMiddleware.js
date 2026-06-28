const multer = require('multer');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (!/^image\/(jpeg|png|jpg)$/.test(file.mimetype)) {
            return cb(new Error('Only JPG and PNG images are allowed'));
        }
        cb(null, true);
    }
});

module.exports = upload;
