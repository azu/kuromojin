// Derived from kuromoji.js CharacterDefinition / InvokeDefinitionMap (Apache-2.0). Read-only part only.
import { ByteReader } from "../util/ByteReader";

export class CharacterClass {
    constructor(
        readonly class_id: number,
        readonly class_name: string,
        readonly is_always_invoke: number,
        readonly is_grouping: number,
        readonly max_length: number
    ) {}
}

const DEFAULT_CATEGORY = "DEFAULT";

export class CharacterDefinition {
    private readonly classes: CharacterClass[] = [];
    private readonly defaultClass: CharacterClass;

    constructor(
        private readonly categoryMap: Uint8Array,
        readonly compatibleCategoryMap: Uint32Array,
        invokeDefinition: Uint8Array
    ) {
        const reader = new ByteReader(invokeDefinition);
        let defaultId: number | undefined;
        while (reader.position + 1 < reader.size()) {
            const classId = this.classes.length;
            const isAlwaysInvoke = reader.get();
            const isGrouping = reader.get();
            const maxLength = reader.getInt();
            const className = reader.getString();
            if (className === DEFAULT_CATEGORY && defaultId === undefined) defaultId = classId;
            this.classes.push(new CharacterClass(classId, className, isAlwaysInvoke, isGrouping, maxLength));
        }
        this.defaultClass = this.classes[defaultId!];
    }

    /** `code` is the first UTF-16 code unit of the character */
    lookup(code: number): CharacterClass {
        if (code >= 0xd800 && code <= 0xdbff) {
            // Surrogate pair character codes can not be defined by char.def, so set DEFAULT category
            return this.defaultClass;
        }
        const classId = this.categoryMap[code];
        if (classId === undefined) return this.defaultClass;
        return this.classes[classId];
    }
}
