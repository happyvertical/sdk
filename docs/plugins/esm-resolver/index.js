module.exports = function (context, options) {
  return {
    name: 'esm-resolver',
    configureWebpack(config, isServer) {
      return {
        resolve: {
          fullySpecified: false,
        },
        module: {
          rules: [
            {
              test: /\.m?js$/,
              resolve: {
                fullySpecified: false
              }
            }
          ]
        }
      };
    }
  };
};