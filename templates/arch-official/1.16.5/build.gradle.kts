plugins {
    // Minimal root — wire Architectury Loom for a real project.
}

allprojects {
    group = "__MAVEN_GROUP__"
    version = "__MOD_VERSION__"
}

subprojects {
    repositories {
        mavenCentral()
        maven("https://maven.fabricmc.net/")
        maven("https://maven.architectury.dev/")
        maven("https://files.minecraftforge.net/maven/")
    }
}
