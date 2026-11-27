pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        if (System.getenv("PLAYSTUDY_TEST_MIRROR") == "1") {
            maven("https://maven-central.storage-download.googleapis.com/maven2")
        }
        mavenCentral()
    }
}
rootProject.name = "PlayStudyApk"
include(":app")
