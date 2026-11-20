# 辞書の設計

[English](design.md)

## この文書について

この設計は、kuromojin が [kuromojin の Product](../../product.ja.md) の [辞書の Requirements](requirements.ja.md) をどう満たすかを説明します。

### 読者

kuromojin が辞書を見つける方法や読み込む方法を変更する人とエージェント。

### 前提知識

- [辞書の Requirements](requirements.ja.md)

### この文書の範囲外

トークナイザーがテキストをどう解析するか、およびトークンをどう再利用するか。

## 実装の方針

kuromojin は読み込みを kuromoji.js に任せます。
辞書のパスを決め、そのパスからトークナイザーを作るよう kuromoji.js に求め、結果をモジュールに保持します。

### 辞書のパス

パスは、呼び出しのたびではなく、読み込みを始めるときにだけ決めます。
最初の呼び出しに `options` があるとき、kuromojin はそのオブジェクト全体を kuromoji.js に渡します。kuromoji.js はそこから `dicPath` を読み、なければ `dict/` を使います。
最初の呼び出しに `options` がないとき、kuromojin は `KUROMOJIN_DIC_PATH`、`window.kuromojin.dicPath` の順に見ます。どちらもなければ、`kuromoji` パッケージがインストールされている場所を Node.js に問い合わせ、そのメインファイルの隣にある `dict` ディレクトリを使います。

### 一度だけの読み込み

モジュールは 3 つの値を保持します。トークナイザー、読み込みが始まったことを示すフラグ、読み込みの結果のための 1 つの Promise です。
`getTokenizer` は、トークナイザーがあればそれを返します。
なければ、フラグが立っているときは Promise を返します。
どちらでもなければ、フラグを立て、kuromoji.js のビルドを始め、Promise を返します。
ビルドのコールバックは、トークナイザーで Promise を解決するか、エラーで Promise を拒否します。

フラグは下ろしません。
そのため、読み込みが失敗すると拒否された Promise が残り、その後の呼び出しはすべてそれを受け取ります。

### ファイルの読み込み

kuromoji.js が 12 個のファイルを読み、展開します。
Node.js では、ファイルシステムで読み、`zlib` モジュールで展開します。
ブラウザでは、各ファイルを `XMLHttpRequest` で要求し、JavaScript で書かれた gzip の実装で展開します。
バンドラーは、`kuromoji` パッケージの `browser` フィールドによってブラウザ用のローダーを選びます。

## アーキテクチャとシーケンス図

図は不要です。読み込みは、1 つの Promise の後ろにある kuromoji.js の 1 回のビルドです。

## データモデルと ER 図

辞書は kuromoji.js 0.1.2 のデータで、kuromojin は独自のモデルを定義しません。

## API とインターフェース

- `getTokenizerOption.dicPath: string` は、呼び出しの辞書のパスである。
- 環境変数 `KUROMOJIN_DIC_PATH` は Node.js で読む。
- `window.kuromojin.dicPath` はブラウザで読む。

## 外部サービスとの連携

なし。kuromojin は、辞書のファイルとそれを読み込むコードを npm パッケージ `kuromoji` に依存します。

## データの扱い

辞書のファイルは読むだけで、書きません。
展開した辞書は、プロセスが終わるまでメモリに残ります。

## 認証と認可の注意

なし。kuromojin は、辞書のファイルへのリクエストに認証情報を付けません。

## セキュリティの考慮事項

[Requirements のセキュリティの考慮事項](requirements.ja.md#セキュリティの考慮事項) のほかにはありません。

## デプロイの注意

辞書は `kuromoji` パッケージの一部なので、そのファイルが変わるのは、kuromojin がそのパッケージのバージョンを変えたときだけです。

## 検討した代替案

辞書のパスの指定の順序と、失敗した読み込みをそのまま残すことについては、代替案の記録がなく、理由はわかっていません。

## 未解決事項

なし。
