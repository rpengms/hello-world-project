import XCTest
@testable import HelloWorld

class HelloWorldTests: XCTestCase {

    func testExample() throws {
        // This is an example of a functional test case.
        XCTAssertEqual("Hello, World!", "Hello, World!")
    }

    func testPerformanceExample() throws {
        self.measure {
            // Measure the time of code here.
        }
    }
}