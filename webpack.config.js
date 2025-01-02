const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const config = {
    mode: process.env.NODE_ENV === 'development' ? 'development' : 'production',
    entry: path.join(__dirname, 'src/renderer/index.tsx'),
    target: 'electron-renderer',
    output: {
        path: path.join(__dirname, 'dist/renderer'),
        filename: 'renderer.js',
        publicPath: './', // 상대 경로로 수정
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                use: {
                    loader: 'ts-loader',
                    options: {
                        configFile: path.join(__dirname, 'tsconfig.json'),
                    },
                },
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader'],
            },
            {
                test: /\.(png|jpg|gif|svg)$/i,
                type: 'asset/resource',
            },
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js', '.jsx'],
        alias: {
            '@': path.resolve(__dirname, 'src/'),
        },
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: path.join(__dirname, 'src/renderer/index.html'),
            filename: 'index.html',
            inject: true,
        }),
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: path.join(__dirname, 'files'),
                    to: path.join(__dirname, 'dist', 'electron', 'files'),
                    toType: 'dir',
                },
            ],
        }),
    ],
    devServer: {
        static: {
            directory: path.join(__dirname, 'dist/renderer'),
            publicPath: '/',
        },
        port: 8080,
        hot: true,
        compress: true,
        historyApiFallback: true,
        open: false,
        devMiddleware: {
            writeToDisk: true,
        },
        host: 'localhost',
        // headers 설정 추가
        headers: {
            'Access-Control-Allow-Origin': '*',
        },
    },
};

module.exports = config;
