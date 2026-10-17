const path = require("path");
const Mocha = require("mocha");
exports.run = () => {
	const mocha = new Mocha({ ui: "bdd", timeout: 30000, color: true });
	mocha.addFile(path.join(__dirname, "extension.test.cjs"));
	return new Promise((resolve, reject) => mocha.run((f) => (f ? reject(new Error(`${f} test(s) failed`)) : resolve())));
};
