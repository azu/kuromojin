# トークン化の設計

[English](design.md)

## この文書について

この設計は、kuromojin が [kuromojin の Product](../../product.ja.md) の [トークン化の Requirements](requirements.ja.md) をどう満たすかを説明します。

### 読者

kuromojin の解析やトークンの再利用を変更する人とエージェント。

### 前提知識

- [トークン化の Requirements](requirements.ja.md)。特にトークンの項目
- [辞書の Requirements](../dictionary/requirements.ja.md)。トークナイザーが何から作られるか

### この文書の範囲外

辞書をどう見つけて読み込むか、およびオンラインのプレイグラウンド。

## 実装の方針

kuromojin は自分ではテキストを解析しません。
kuromoji.js にトークナイザーを一度だけ求め、その手前にトークンのキャッシュを置きます。

### 解析

`getTokenizer` が解決するトークナイザーは、kuromoji.js のトークナイザーのオブジェクトそのもので、ラッパーはありません。
そのため、`tokenize` と `tokenizeForSentence` は kuromoji.js の関数で、トークンは kuromoji.js が作るオブジェクトです。
kuromojin は kuromoji.js の厳密なバージョン 0.1.2 に依存するので、テキストのトークンが変わるのは、kuromojin がこのバージョンを変えたときだけです。

### トークンの再利用

`tokenize(text, options)` は、まずトークナイザーを待ちます。
次に、テキストからトークンへのマップでテキストを探します。
テキストがあれば、保存してある配列を返します。
なければ、`tokenizeForSentence(text)` を呼び、返った配列をテキストをキーにして保存し、その配列を返します。
`noCacheTokenize: true` のときは、`tokenizeForSentence(text)` を呼び、マップを読み書きせずに結果を返します。

マップは最近使われた 10,000 個のテキストを保持し、いっぱいになると、もっとも長く使われていないテキストを取り除きます。
マップはモジュールの変数なので、インストールされた kuromojin のコピーごとに 1 つあり、1 つのコピーのすべての呼び出し元が共有します。
保存した配列はコピーも凍結もしません。呼び出し元による変更を防いでいるのは、結果の読み取り専用の型です。

## アーキテクチャとシーケンス図

図は不要です。`tokenize` は、マップを 1 回引き、トークナイザーを 1 回呼ぶだけです。

## データモデルと ER 図

トークンは、[トークンの項目](requirements.ja.md#トークンの項目) で説明するオブジェクトです。
キャッシュは 1 つのマップで、キーがテキスト、値がトークンの配列です。

## API とインターフェース

kuromojin は 2 つの関数と 3 つの型を公開します。

- `tokenize(text: string, options?: getTokenizerOption): Promise<Readonly<Readonly<KuromojiToken>[]>>`
- `getTokenizer(options?: getTokenizerOption): Promise<Tokenizer>`
- `KuromojiToken` はトークンの型である。未知語のトークンは `reading` と `pronunciation` を持たないが、型はこの 2 つを `string` と宣言する。
- `Tokenizer` は `tokenize(text: string): KuromojiToken[]` と `tokenizeForSentence(text: string): KuromojiToken[]` を持つ。
- `getTokenizerOption` は `dicPath: string` と、省略できる `noCacheTokenize?: boolean` を持つ。

## 外部サービスとの連携

なし。解析は、解析器である npm パッケージ `kuromoji` と、キャッシュのための `lru_map` に依存し、ネットワークのサービスを使いません。

## データの扱い

テキストとそのトークンは、上で説明したマップだけに、プロセスのメモリの中で保持します。
ファイルには何も書きません。

## 認証と認可の注意

なし。解析にアクセス制御はありません。

## セキュリティの考慮事項

[Requirements のセキュリティの考慮事項](requirements.ja.md#セキュリティの考慮事項) のほかにはありません。共有されるトークンを変更する呼び出し元に対して、この設計は保護を加えません。

## デプロイの注意

kuromoji.js のバージョンを変えると、テキストのトークンが変わることがあり、トークンをパターンと比べるルールはトークンに依存しています。
このため、0.1.1 から 0.1.2 への変更は kuromojin のメジャーバージョンとしてリリースしました。

## 検討した代替案

### 解析の前に句読点でテキストを分ける

kuromoji.js のトークナイザーの `tokenize` は、`、` と `。` でテキストを分け、それぞれを解析します。
kuromojin は最初これを使っていましたが、`。` で強制的に分けると誤った結果になったため、`tokenizeForSentence` に変えました。

### そのほかの判断

キャッシュの大きさと `lru_map` の選択については、代替案の記録がなく、理由はわかっていません。

## 未解決事項

なし。
