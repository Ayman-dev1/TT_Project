const errorHandler = (err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    const isClientError = statusCode >= 400 && statusCode < 500;
    const message = isClientError
        ? (err.message || 'Bad request')
        : 'Internal server error';
    if (!isClientError) {
        console.error('[Server Error]', err.stack || err.message);
    }
    res.status(statusCode);
    res.json({ message });
};

module.exports = { errorHandler };
