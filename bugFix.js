module.exports = function (req, res, next) {
    if (req.path != "/login" || req.path != "/signup") {
        if (req.session.authorized == true) {
            next();
        } else {
            res.redirect('/login');
        }
    } else {
        next();
    }
}